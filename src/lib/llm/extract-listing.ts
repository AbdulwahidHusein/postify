import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getLlmApiKey, serverEnv } from "@/lib/env.server";
import {
  parseListingCaption,
  type ParsedListing,
} from "@/lib/parse-listing";

const listingSchema = z.object({
  isProduct: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().max(120),
  description: z.string().max(4000),
  price: z.number().nonnegative().nullable(),
  compareAtPrice: z.number().nonnegative().nullable(),
  currency: z.string().max(8).nullable(),
  category: z.string().max(160).nullable(),
  tags: z.array(z.string().max(40)).max(12),
  sku: z.string().max(64).nullable(),
  slugHint: z.string().max(48).nullable(),
});

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isProduct",
    "confidence",
    "title",
    "description",
    "price",
    "compareAtPrice",
    "currency",
    "category",
    "tags",
    "sku",
    "slugHint",
  ],
  properties: {
    isProduct: {
      type: "boolean",
      description:
        "true only if the post is offering a product/service for sale. false for announcements, memes, giveaways, questions, or non-listing chat.",
    },
    confidence: {
      type: "number",
      description:
        "Your confidence that the extraction is correct, from 0.0 to 1.0.",
    },
    title: {
      type: "string",
      description:
        "Concise product name in the SAME language as the caption. No price, no currency, no hashtags, minimal emojis.",
    },
    description: {
      type: "string",
      description:
        "Clean buyer-facing details in the SAME language as the caption. Keep specs/condition/size/color. Remove duplicated price lines once price is extracted. Do not translate.",
    },
    price: {
      type: ["number", "null"],
      description:
        "Current selling price as a number only (e.g. 4500). null if no price is stated.",
    },
    compareAtPrice: {
      type: ["number", "null"],
      description:
        "Earlier/original/strikethrough price as a number only, if clearly present and higher than price; otherwise null.",
    },
    currency: {
      type: ["string", "null"],
      description:
        "Currency code only: ETB, USD, EUR, etc. Map ብር/birr → ETB, $ → USD, € → EUR. Use the provided default when price exists but currency is missing.",
    },
    category: {
      type: ["string", "null"],
      description:
        "Single best category. Prefer one of preferredCategories when it fits. Keep category in the caption language when inventing one; English is OK for preferredCategories matches.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "0–8 short search tags in the SAME language as the caption (brand, model, color, condition).",
    },
    sku: {
      type: ["string", "null"],
      description:
        "SKU / model / serial only if explicitly written in the caption; otherwise null. Do not invent.",
    },
    slugHint: {
      type: ["string", "null"],
      description:
        "ASCII URL slug stem from the title: lowercase letters/digits/hyphens only. Transliterate non-Latin scripts if needed. No spaces.",
    },
  },
} as const;

export type ExtractListingOptions = {
  defaultCurrency?: string;
  hasMedia?: boolean;
  preferredCategories?: string[];
};

const LLM_TIMEOUT_MS = 20_000; // bound the call even off-request

function llmModel() {
  return serverEnv.LLM_MODEL || "gemini-2.5-flash";
}

function normalizeListing(
  raw: z.infer<typeof listingSchema>,
  opts?: ExtractListingOptions,
): ParsedListing {
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const currency = (raw.currency?.trim() || defaultCurrency).toUpperCase();
  const tags = raw.tags
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  const title = raw.title.trim().slice(0, 120) || "Channel listing";
  const slugHint =
    raw.slugHint
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || null;

  let compareAtPrice = raw.compareAtPrice;
  if (
    compareAtPrice != null &&
    raw.price != null &&
    compareAtPrice <= raw.price
  ) {
    compareAtPrice = null;
  }

  return {
    isProduct: raw.isProduct,
    confidence: Math.min(1, Math.max(0, raw.confidence)),
    title,
    description: raw.description.trim().slice(0, 4000),
    price: raw.price,
    compareAtPrice,
    currency,
    category: raw.category?.trim().slice(0, 160) || null,
    tags,
    sku: raw.sku?.trim().slice(0, 64) || null,
    slugHint: slugHint?.slice(0, 48) || null,
    source: "gemini",
  };
}

function buildPrompt(caption: string, opts?: ExtractListingOptions): string {
  const preferred =
    opts?.preferredCategories?.filter(Boolean).slice(0, 40) ?? [];
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const hasMedia = opts?.hasMedia ? "yes" : "no";

  const lines = [
    "You are extracting structured ecommerce fields from a Telegram channel caption.",
    "Follow every rule exactly. Output must match the JSON schema.",
    "",
    "LANGUAGE (critical):",
    "- Preserve the caption language exactly for title, description, and tags.",
    "- Do NOT translate. If the caption is Amharic, write Amharic. If English, English. If mixed, keep the same mix.",
    "- Only slugHint may be ASCII/transliterated for URLs.",
    "",
    "TASK:",
    "1) Decide if this is a product listing for sale (isProduct).",
    "2) Extract title, description, price, compareAtPrice, currency, category, tags, sku, slugHint.",
    "3) Set confidence based on how clear the caption is.",
    "",
    "EXTRACTION RULES:",
    "- title: short product name only; strip price, currency words, hashtags, and noisy emoji.",
    "- description: useful selling details only; remove lines that only restate the price; do not invent specs.",
    "- price / compareAtPrice: numbers only (no commas/symbols). compareAtPrice only if it is clearly an older/higher price.",
    "- currency: ETB for ብር/birr/ETB; USD for $/USD; EUR for €/EUR. If a price exists but currency is missing, use " +
      defaultCurrency +
      ".",
    "- category: pick the single best fit. Prefer one value from preferredCategories when listed below.",
    "- tags: up to 8 real attributes from the caption (brand, model, color, size, condition). Same language as caption. Do not invent.",
    "- sku: only if an explicit SKU/model/code appears; otherwise null.",
    "- slugHint: lowercase ascii slug from the title (hyphens, no spaces).",
    "- If not a product listing: isProduct=false. Still fill title/description from the caption without translating; set price/sku/tags empty/null as appropriate.",
    "",
    "CONTEXT:",
    `- Default currency: ${defaultCurrency}`,
    `- Caption has product photo(s): ${hasMedia}`,
  ];

  if (preferred.length) {
    lines.push(`- preferredCategories: ${preferred.join(" | ")}`);
  }

  lines.push(
    "",
    "CAPTION:",
    "```",
    caption.trim() || "(empty caption — photo only)",
    "```",
  );

  return lines.join("\n");
}

async function extractWithGemini(
  caption: string,
  opts?: ExtractListingOptions,
): Promise<ParsedListing | null> {
  const apiKey = getLlmApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  // Bound the request so a hung provider can't stall the worker forever;
  // on abort this throws and extractListingFromCaption falls back to the
  // heuristic parser.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: llmModel(),
      contents: buildPrompt(caption, opts),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        abortSignal: controller.signal,
      },
    });

    const text = response.text?.trim();
    if (!text) return null;

    const parsedJson: unknown = JSON.parse(text);
    const validated = listingSchema.parse(parsedJson);
    return normalizeListing(validated, opts);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Channel caption → structured listing.
 * Uses Gemini 2.5 Flash structured output when configured; otherwise heuristic.
 */
export async function extractListingFromCaption(
  caption: string,
  opts?: ExtractListingOptions,
): Promise<ParsedListing> {
  const trimmed = caption.trim();
  const heuristic = parseListingCaption(trimmed, opts);

  if (!trimmed && !opts?.hasMedia) {
    return heuristic;
  }

  if (!getLlmApiKey()) {
    return heuristic;
  }

  try {
    const ai = await extractWithGemini(trimmed || "(photo only)", opts);
    if (!ai) return heuristic;

    // Photo-only posts with weak model title: keep media product signal.
    if (!ai.isProduct && opts?.hasMedia && heuristic.isProduct) {
      return {
        ...ai,
        isProduct: true,
        confidence: Math.max(ai.confidence, 0.55),
        title:
          ai.title && ai.title !== "Untitled" ? ai.title : heuristic.title,
        description: ai.description || heuristic.description,
        price: ai.price ?? heuristic.price,
        currency: ai.currency ?? heuristic.currency,
      };
    }

    return ai;
  } catch (error) {
    console.error("[llm] listing extract failed; using heuristic", error);
    return heuristic;
  }
}

export function formatListingTags(tags: string[]): string | null {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : null;
}
