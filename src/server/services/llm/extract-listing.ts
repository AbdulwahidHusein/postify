import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getLlmApiKey, serverEnv } from "@/server/env";
import type { ParsedListing } from "@/server/services/llm/parse-listing";

const listingSchema = z.object({
  isProduct: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().max(120),
  description: z.string().max(6000),
  price: z.number().nonnegative().nullable(),
  compareAtPrice: z.number().nonnegative().nullable(),
  currency: z.string().max(8).nullable(),
  category: z.string().max(160).nullable(),
  tags: z.array(z.string().max(40)).max(12),
  sku: z.string().max(64).nullable(),
  condition: z.string().max(60).nullable(),
  brand: z.string().max(80).nullable(),
  model: z.string().max(120).nullable(),
  location: z.string().max(120).nullable(),
  isNegotiable: z.boolean().nullable(),
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
    "condition",
    "brand",
    "model",
    "location",
    "isNegotiable",
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
        "Single best category in English as a short free-text label (e.g. 'Cars', 'Mobile Phones', 'Shoes', 'Laptops'). Do not use ' > ' separators. We will match it to our taxonomy locally.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "0–8 short search tags in the SAME language as the caption (brand, model, color, size, condition).",
    },
    sku: {
      type: ["string", "null"],
      description:
        "SKU / serial only if explicitly written in the caption; otherwise null. Do not invent.",
    },
    condition: {
      type: ["string", "null"],
      description:
        "Item condition only if stated: 'Brand New', 'New', 'Local Used', 'Foreign Used', 'Used', 'Like New', 'Good', 'Fair', 'Refurbished'. null if not mentioned.",
    },
    brand: {
      type: ["string", "null"],
      description:
        "Brand or manufacturer name only if stated in the caption (e.g. 'Samsung', 'Nike', 'Toyota'). null if not mentioned. Do not invent.",
    },
    model: {
      type: ["string", "null"],
      description:
        "Specific model name/number only if stated (e.g. 'Galaxy S23', 'Air Force 1', 'Corolla 2018'). null if not mentioned. Do not invent.",
    },
    location: {
      type: ["string", "null"],
      description:
        "City or area only if mentioned in the caption (e.g. 'Addis Ababa', 'Bole', 'Mekelle'). null if not stated.",
    },
    isNegotiable: {
      type: ["boolean", "null"],
      description:
        "true if the price is marked as negotiable/flexible (e.g. 'negotiable', 'or best offer', 'ዋጋ ይደረጋል'). false or null otherwise.",
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

export type AiExtraction = {
  listing: ParsedListing;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Hard caps that bound the cost of a single call. */
export const MAX_CAPTION_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 1024;
const LLM_TIMEOUT_MS = 20_000;

export function llmModel() {
  return serverEnv.LLM_MODEL || "gemini-2.5-flash";
}

export function aiConfigured() {
  return Boolean(getLlmApiKey() || serverEnv.GOOGLE_CLOUD_PROJECT);
}

let client: GoogleGenAI | null = null;
function genai(): GoogleGenAI {
  if (client) return client;
  const apiKey = getLlmApiKey();
  client = apiKey
    ? new GoogleGenAI({ apiKey })
    : new GoogleGenAI({
        vertexai: true,
        project: serverEnv.GOOGLE_CLOUD_PROJECT,
        location: serverEnv.GOOGLE_CLOUD_LOCATION,
      });
  return client;
}

function normalizeListing(
  raw: z.infer<typeof listingSchema>,
  opts?: ExtractListingOptions,
): ParsedListing {
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const currency = (raw.currency?.trim() || defaultCurrency).toUpperCase().slice(0, 8);
  const slugHint =
    raw.slugHint
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || null;
  let compareAtPrice = raw.compareAtPrice;
  if (compareAtPrice != null && raw.price != null && compareAtPrice <= raw.price) {
    compareAtPrice = null;
  }
  return {
    isProduct: raw.isProduct,
    confidence: Math.min(1, Math.max(0, raw.confidence)),
    title: raw.title.trim().slice(0, 120) || "Listing",
    description: raw.description.trim().slice(0, 4000),
    price: raw.price,
    compareAtPrice,
    currency,
    category: raw.category?.trim().slice(0, 160) || null,
    tags: raw.tags.map((t) => t.trim()).filter(Boolean).slice(0, 8),
    sku: raw.sku?.trim().slice(0, 64) || null,
    condition: raw.condition?.trim().slice(0, 60) || null,
    brand: raw.brand?.trim().slice(0, 80) || null,
    model: raw.model?.trim().slice(0, 120) || null,
    location: raw.location?.trim().slice(0, 120) || null,
    isNegotiable: Boolean(raw.isNegotiable),
    slugHint: slugHint?.slice(0, 48) || null,
    source: "gemini",
  };
}

function buildPrompt(caption: string, opts?: ExtractListingOptions): string {
  const preferred = opts?.preferredCategories?.filter(Boolean).slice(0, 40) ?? [];
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const lines = [
    "Extract structured ecommerce fields from a Telegram post caption. Output must match the JSON schema.",
    "",
    "LANGUAGE: keep title, description and tags in the caption's own language (Amharic stays Amharic). Never translate. Only slugHint is ASCII.",
    "",
    "RULES:",
    "- isProduct: true only if the post offers an item or service for sale. Announcements, greetings, questions, giveaways and memes are false.",
    "- title: short item name; no price, currency, hashtags or emoji.",
    "- description: buyer-facing details from the caption, at most 800 characters; drop lines that only repeat the price; never invent specs.",
    "- price / compareAtPrice: plain numbers. compareAtPrice only for a clearly older, higher price.",
    `- currency: ETB for ብር/birr/ETB, USD for $/USD, EUR for €/EUR; if a price has no currency use ${defaultCurrency}.`,
    "- category: short English label for the item type (e.g. 'Mobile Phones', 'Shoes', 'Cars'), no ' > ' separators.",
    "- tags: up to 8 attributes actually present (brand, model, colour, size, condition).",
    "- sku, condition, brand, model, location: only when stated in the caption; otherwise null. Never guess.",
    "- isNegotiable: true when the price is marked negotiable (e.g. 'negotiable', 'ዋጋ ይደረጋል').",
    "- confidence: 0 to 1, how sure you are that the fields are right.",
    "",
    `Post has photo(s): ${opts?.hasMedia ? "yes" : "no"}`,
  ];
  if (preferred.length) lines.push(`Shop's usual categories: ${preferred.join(" | ")}`);
  lines.push("", "CAPTION:", "```", caption.slice(0, MAX_CAPTION_CHARS) || "(photo only, no caption)", "```");
  return lines.join("\n");
}

/**
 * One Gemini call. Thinking is disabled and output is capped, so the cost of
 * a call is bounded by the caption cap. Throws on failure; the caller decides
 * on fallbacks and records usage.
 */
export async function aiExtractListing(
  caption: string,
  opts?: ExtractListingOptions,
): Promise<AiExtraction> {
  const model = llmModel();
  const response = await genai().models.generateContent({
    model,
    contents: buildPrompt(caption, opts),
    config: {
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    },
  });
  const usage = response.usageMetadata;
  const text = response.text?.trim();
  if (!text) throw new Error("Empty AI response");
  const listing = normalizeListing(listingSchema.parse(JSON.parse(text)), opts);
  return {
    listing,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}
