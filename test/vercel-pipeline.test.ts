import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { FakeTelegram, tgError } from "./fake-telegram";
import { channelPost, makeShopWithChannel, nextUpdateId } from "./helpers";
import { db } from "@/server/db";
import { jobs, productImages, productSources, products } from "@/server/db/schema";
import { serverEnv } from "@/server/env";
import { acceptListingUpdate } from "@/server/domain/ingest";
import { drainJobs } from "@/server/services/job-queue";
import { pickTelegramSizes } from "@/server/domain/media";

let fake: FakeTelegram;

beforeAll(async () => {
  await createTestDb();
  // Run the whole pipeline through the Postgres queue, as on Vercel.
  (serverEnv as { TASKS_MODE: string }).TASKS_MODE = "db";
});

beforeEach(async () => {
  fake = new FakeTelegram().install();
  await fake.installFileServer();
});

describe("Telegram pipeline on the Postgres queue (Vercel mode)", () => {
  it("post → product → photos copied from Telegram sizes → Order button", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -3001 });
    const post = channelPost(-3001, { photo: true, caption: "Samsung A54 128GB\n28,500 birr" });
    expect(await acceptListingUpdate({ updateId: nextUpdateId(), message: post, isEdit: false })).toBe("queued");
    const s = await drainJobs({ budgetMs: 15_000 });
    expect(s.failed).toBe(0);

    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(p.status).toBe("published");
    const [img] = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(img.status).toBe("ready");
    expect(img.storageKey).toMatch(/@jpg$/);
    expect(img.width).toBe(1280);
    expect(img.telegramSizes?.length).toBe(2);
    expect(fake.callsTo("editMessageReplyMarkup")).toHaveLength(1);
    const left = await db.select().from(jobs).where(eq(jobs.status, "pending"));
    expect(left).toHaveLength(0);
  });

  it("an album becomes one product even though its parts arrive separately", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -3002 });
    for (let i = 0; i < 3; i += 1) {
      await acceptListingUpdate({ updateId: nextUpdateId(), message: channelPost(-3002, { photo: true, mediaGroupId: "va1", ...(i === 0 ? { caption: "Office desk 12,000 birr" } : {}) }), isEdit: false });
    }
    await drainJobs({ budgetMs: 15_000 });
    const list = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(list).toHaveLength(1);
    expect(await db.select().from(productImages).where(eq(productImages.productId, list[0].id))).toHaveLength(3);
  });

  it("a Telegram 429 on the button edit is retried later, not lost", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -3003 });
    fake.failNext("editMessageReplyMarkup", tgError(429, "Too Many Requests: retry after 30", "editMessageReplyMarkup"));
    await acceptListingUpdate({ updateId: nextUpdateId(), message: channelPost(-3003, { photo: true, caption: "Lamp 900 birr" }), isEdit: false });
    await drainJobs({ budgetMs: 15_000 });
    // Let any retry that was pushed out by retry_after run now (as the sweep would).
    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.status, "pending"));
    await drainJobs({ budgetMs: 15_000 });

    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, p.id));
    const edits = fake.callsTo("editMessageReplyMarkup").filter((c) => c.args[0] === -3003);
    expect(edits.length).toBeGreaterThanOrEqual(2); // first attempt hit the 429
    expect(src.buttonStatus).toBe("synced");
    expect(await db.select().from(jobs).where(eq(jobs.status, "failed"))).toHaveLength(0);
  });
});

describe("Telegram photo sizes", () => {
  it("serves each width from the smallest Telegram size that covers it", () => {
    const sizes = [
      { fileId: "s", width: 90, height: 67 },
      { fileId: "m", width: 320, height: 240 },
      { fileId: "x", width: 800, height: 600 },
      { fileId: "y", width: 1280, height: 960 },
    ];
    expect(pickTelegramSizes(sizes).map((p) => [p.width, p.size.fileId])).toEqual([[320, "m"], [800, "x"], [1600, "y"]]);
    expect(pickTelegramSizes([{ fileId: "only", width: 640, height: 480 }]).map((p) => p.size.fileId)).toEqual(["only", "only", "only"]);
  });
});
