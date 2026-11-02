import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.hoisted(() => {
  process.env.AI_NEW_SHOP_DAILY_QUOTA = "2";
  process.env.AI_DAILY_BUDGET_USD = "0.001"; // 1000 micros
  process.env.AI_PRICE_INPUT_PER_M = "1";
  process.env.AI_PRICE_OUTPUT_PER_M = "1";
});

const calls = vi.hoisted(() => ({ n: 0, fail: 0 }));
vi.mock("@/server/services/llm/extract-listing", () => ({
  MAX_CAPTION_CHARS: 2000,
  llmModel: () => "gemini-test",
  aiConfigured: () => true,
  aiExtractListing: async (caption: string) => {
    calls.n += 1;
    if (calls.fail > 0) {
      calls.fail -= 1;
      throw new Error("provider down");
    }
    return {
      model: "gemini-test",
      inputTokens: 200,
      outputTokens: 100,
      listing: {
        isProduct: true, confidence: 0.95, title: `AI: ${caption.split("\n")[0]}`, description: "",
        price: 1000, compareAtPrice: null, currency: "ETB", category: "Mobile Phones", tags: [],
        sku: null, condition: null, brand: null, model: null, location: null, isNegotiable: false,
        slugHint: null, source: "gemini",
      },
    };
  },
}));

import { createTestDb } from "./db";
import { makeUser } from "./helpers";
import { db } from "@/server/db";
import { aiUsage } from "@/server/db/schema";
import { createShop } from "@/server/domain/shops";
import { extractWithGuardrails } from "@/server/domain/ai-guard";
import { resetInlineTasks } from "@/server/services/tasks";

beforeAll(async () => {
  await createTestDb();
});
beforeEach(() => {
  calls.n = 0;
  calls.fail = 0;
  resetInlineTasks();
});

async function newShop() {
  const owner = await makeUser();
  return createShop({ ownerUserId: owner.id, name: `AI shop ${Math.random().toString(36).slice(2, 6)}` });
}

describe("AI guardrails", () => {
  it("caches identical captions per shop", async () => {
    const shop = await newShop();
    const a = await extractWithGuardrails(shop, "Phone A 1000 birr", { hasMedia: true });
    const b = await extractWithGuardrails(shop, "Phone A 1000 birr", { hasMedia: true });
    expect(a.via).toBe("ai");
    expect(b.via).toBe("cache");
    expect(calls.n).toBe(1);
  });

  it("enforces the new-shop daily quota, then falls back to the free parser", async () => {
    const shop = await newShop();
    await extractWithGuardrails(shop, "One 1000 birr", { hasMedia: true });
    await extractWithGuardrails(shop, "Two 1000 birr", { hasMedia: true });
    const third = await extractWithGuardrails(shop, "Three 1000 birr", { hasMedia: true });
    expect(calls.n).toBe(2);
    expect(third).toMatchObject({ via: "rules", limited: "quota" });
    expect(third.listing.title).toBe("Three");
  });

  it("retries once, then uses the free parser without failing the job", async () => {
    const shop = await newShop();
    calls.fail = 2;
    const r = await extractWithGuardrails(shop, "Flaky 1000 birr", { hasMedia: true });
    expect(r.via).toBe("rules");
    expect(calls.n).toBe(2);
    const rows = await db.select().from(aiUsage).where(eq(aiUsage.shopId, shop.id));
    expect(rows.filter((r) => r.outcome === "error")).toHaveLength(2);
  });

  it("stops all AI calls once the platform budget is spent", async () => {
    // Earlier tests spent 300 micros per call; push the day over 1000 micros.
    const shop = await newShop();
    await extractWithGuardrails(shop, "Spend A 1000 birr", { hasMedia: true });
    const shop2 = await newShop();
    await extractWithGuardrails(shop2, "Spend B 1000 birr", { hasMedia: true });
    const before = calls.n;
    const shop3 = await newShop();
    const r = await extractWithGuardrails(shop3, "Blocked 1000 birr", { hasMedia: true });
    expect(r).toMatchObject({ via: "rules", limited: "budget" });
    expect(calls.n).toBe(before);
  });
});
