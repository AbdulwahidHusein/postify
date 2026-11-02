import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { aiCache, aiUsage, type Shop } from "@/server/db/schema";
import { serverEnv } from "@/server/env";
import { sha256 } from "@/server/ids";
import { log } from "@/server/log";
import { enqueue } from "@/server/services/tasks";
import {
  aiConfigured,
  aiExtractListing,
  llmModel,
  MAX_CAPTION_CHARS,
  type ExtractListingOptions,
} from "@/server/services/llm/extract-listing";
import { parseListingCaption, type ParsedListing } from "@/server/services/llm/parse-listing";

export type GuardedExtraction = {
  listing: ParsedListing;
  via: "ai" | "cache" | "rules";
  /** Set when a limit forced the free parser; the listing must stay a draft. */
  limited: "quota" | "budget" | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estimateCostMicros(inputTokens: number, outputTokens: number): bigint {
  return BigInt(
    Math.round(
      inputTokens * serverEnv.AI_PRICE_INPUT_PER_M + outputTokens * serverEnv.AI_PRICE_OUTPUT_PER_M,
    ),
  );
}

async function recordUsage(entry: {
  shopId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  outcome: "ok" | "error" | "cached" | "blocked_quota" | "blocked_budget" | "rules";
}) {
  const inputTokens = entry.inputTokens ?? 0;
  const outputTokens = entry.outputTokens ?? 0;
  await db.insert(aiUsage).values({
    shopId: entry.shopId,
    day: today(),
    model: entry.model,
    inputTokens,
    outputTokens,
    costMicros: estimateCostMicros(inputTokens, outputTokens),
    outcome: entry.outcome,
  });
}

export function shopQuota(shop: Pick<Shop, "createdAt">): number {
  const ageDays = (Date.now() - shop.createdAt.getTime()) / 86_400_000;
  return ageDays < 7 ? serverEnv.AI_NEW_SHOP_DAILY_QUOTA : serverEnv.AI_SHOP_DAILY_QUOTA;
}

export async function shopCallsToday(shopId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.shopId, shopId), eq(aiUsage.day, today()), inArray(aiUsage.outcome, ["ok", "error"])),
    );
  return Number(row?.n ?? 0);
}

export async function platformSpendTodayMicros(): Promise<bigint> {
  const [row] = await db
    .select({ s: sql<string>`coalesce(sum(${aiUsage.costMicros}), 0)::text` })
    .from(aiUsage)
    .where(eq(aiUsage.day, today()));
  return BigInt(row?.s ?? "0");
}

/**
 * The only way listing text reaches the AI. Order of checks: cache (free),
 * per-shop daily quota, platform daily budget, then one call with one retry.
 * Every path returns a usable listing; limits only force the free parser.
 */
export async function extractWithGuardrails(
  shop: Shop,
  rawCaption: string,
  opts: ExtractListingOptions,
): Promise<GuardedExtraction> {
  const caption = rawCaption.slice(0, MAX_CAPTION_CHARS);
  const rules = (): ParsedListing => parseListingCaption(caption, opts);
  const model = llmModel();

  if (!aiConfigured()) {
    return { listing: rules(), via: "rules", limited: null };
  }

  const cacheKey = caption ? sha256(`${shop.id}\n${caption}\n${opts.hasMedia ? 1 : 0}`) : null;
  if (cacheKey) {
    const hit = await db.query.aiCache.findFirst({ where: eq(aiCache.key, cacheKey) });
    if (hit) {
      await recordUsage({ shopId: shop.id, model, outcome: "cached" });
      return { listing: hit.result as unknown as ParsedListing, via: "cache", limited: null };
    }
  }

  if ((await shopCallsToday(shop.id)) >= shopQuota(shop)) {
    await recordUsage({ shopId: shop.id, model, outcome: "blocked_quota" });
    log.warn("ai quota reached", { shop_id: shop.id });
    return { listing: rules(), via: "rules", limited: "quota" };
  }

  const budgetMicros = BigInt(Math.round(serverEnv.AI_DAILY_BUDGET_USD * 1_000_000));
  if ((await platformSpendTodayMicros()) >= budgetMicros) {
    await recordUsage({ shopId: shop.id, model, outcome: "blocked_budget" });
    await enqueue(
      "notify",
      {
        kind: "ops_alert",
        key: `ai_budget:${today()}`,
        text: `AI daily budget reached ($${serverEnv.AI_DAILY_BUDGET_USD}). Using the rule-based parser until midnight UTC.`,
      },
      { name: `ops_ai_budget:${today()}` },
    );
    return { listing: rules(), via: "rules", limited: "budget" };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const out = await aiExtractListing(caption, opts);
      await recordUsage({
        shopId: shop.id,
        model: out.model,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        outcome: "ok",
      });
      if (cacheKey) {
        await db
          .insert(aiCache)
          .values({ key: cacheKey, result: out.listing as unknown as Record<string, unknown> })
          .onConflictDoNothing();
      }
      return { listing: out.listing, via: "ai", limited: null };
    } catch (err) {
      await recordUsage({ shopId: shop.id, model, outcome: "error" });
      log.warn("ai extract failed", { shop_id: shop.id, attempt, err });
    }
  }
  return { listing: rules(), via: "rules", limited: null };
}
