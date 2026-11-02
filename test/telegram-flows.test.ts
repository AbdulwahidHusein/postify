import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { FakeTelegram, tgError } from "./fake-telegram";
import { channelPost, makeShopWithChannel, makeUser, nextUpdateId } from "./helpers";
import { db } from "@/server/db";
import {
  aiUsage,
  channels,
  productImages,
  productSources,
  productVariants,
  products,
  telegramUpdates,
} from "@/server/db/schema";
import { acceptListingUpdate } from "@/server/domain/ingest";
import { drainInlineTasks, resetInlineTasks } from "@/server/services/tasks";
import { updateProduct } from "@/server/domain/products";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";

let fake: FakeTelegram;

beforeAll(async () => {
  await createTestDb();
});

beforeEach(async () => {
  resetInlineTasks();
  fake = new FakeTelegram().install();
  await fake.installFileServer();
});

async function ingest(message: ReturnType<typeof channelPost>, isEdit = false) {
  return acceptListingUpdate({ updateId: nextUpdateId(), message, isEdit });
}

describe("channel post → product with Order button", () => {
  it("creates a published product, stores images and edits buttons onto the post", async () => {
    const { owner, shop } = await makeShopWithChannel({ chatId: -1001 });
    const post = channelPost(-1001, { photo: true, caption: "iPhone 13 Pro 128GB\nPrice 45,000 birr" });
    expect(await ingest(post)).toBe("queued");
    await drainInlineTasks();

    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(p.status).toBe("published");
    expect(p.title).toContain("iPhone 13 Pro");
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
    expect(v.priceMinor).toBe(4_500_000n);

    const imgs = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].status).toBe("ready");
    expect(imgs[0].storageKey).toContain(`shops/${shop.id}/products/${p.id}/`);
    expect(imgs[0].storageKey).toMatch(/@jpg$/);
    expect(imgs[0].width).toBe(1280);

    const edits = fake.callsTo("editMessageReplyMarkup");
    expect(edits).toHaveLength(1);
    const [chatId, messageId, other] = edits[0].args as [number, number, { reply_markup: { inline_keyboard: { text: string; url: string }[][] } }];
    expect(chatId).toBe(-1001);
    expect(messageId).toBe((post as { message_id: number }).message_id);
    expect(other.reply_markup.inline_keyboard[0][0].text).toBe("🛒 Order · ETB 45,000");

    const [src] = await db.select().from(productSources).where(eq(productSources.productId, p.id));
    expect(src.buttonMode).toBe("inline");
    expect(src.buttonStatus).toBe("synced");

    const receipts = fake.callsTo("sendMessage").filter((c) => c.args[0] === Number(owner.telegramId));
    expect(receipts).toHaveLength(1);
    expect(String(receipts[0].args[1])).toContain("Listed");
  });

  it("ignores duplicate deliveries of the same update", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1002 });
    const post = channelPost(-1002, { photo: true, caption: "Shoes 2500 br" });
    const updateId = nextUpdateId();
    expect(await acceptListingUpdate({ updateId, message: post, isEdit: false })).toBe("queued");
    expect(await acceptListingUpdate({ updateId, message: post, isEdit: false })).toBe("duplicate");
    await drainInlineTasks();
    expect(await db.select().from(products).where(eq(products.shopId, shop.id))).toHaveLength(1);
  });

  it("turns an album into one product with a reply card, and appends late photos", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1003 });
    await ingest(channelPost(-1003, { photo: true, mediaGroupId: "alb1", caption: "Sofa set 30,000 birr" }));
    await ingest(channelPost(-1003, { photo: true, mediaGroupId: "alb1" }));
    await ingest(channelPost(-1003, { photo: true, mediaGroupId: "alb1" }));
    await drainInlineTasks();

    const list = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(list).toHaveLength(1);
    expect(await db.select().from(productImages).where(eq(productImages.productId, list[0].id))).toHaveLength(3);

    const cards = fake.callsTo("sendMessage").filter((c) => c.args[0] === -1003);
    expect(cards).toHaveLength(1);
    const opts = cards[0].args[2] as { reply_parameters: { message_id: number }; disable_notification: boolean };
    expect(opts.disable_notification).toBe(true);
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, list[0].id));
    expect(src.buttonMode).toBe("reply_card");
    expect(src.cardMessageId).toBeGreaterThan(0);
    expect(opts.reply_parameters.message_id).toBe(src.messageId);

    // A late fourth photo after the album was processed.
    await ingest(channelPost(-1003, { photo: true, mediaGroupId: "alb1" }));
    await drainInlineTasks();
    expect(await db.select().from(productImages).where(eq(productImages.productId, list[0].id))).toHaveLength(4);
    expect(await db.select().from(products).where(eq(products.shopId, shop.id))).toHaveLength(1);
  });

  it("skips chatter without photo or price and never calls the AI", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1004 });
    expect(await ingest(channelPost(-1004, { text: "Good morning everyone! New stock arrives Monday." }))).toBe("queued");
    await drainInlineTasks();
    expect(await db.select().from(products).where(eq(products.shopId, shop.id))).toHaveLength(0);
    expect(await db.select().from(aiUsage).where(eq(aiUsage.shopId, shop.id))).toHaveLength(0);
    const rows = await db.select().from(telegramUpdates).where(eq(telegramUpdates.chatId, -1004n));
    expect(rows[0].status).toBe("skipped");
  });

  it("drafts a post without price and asks the seller for it", async () => {
    const { owner, shop } = await makeShopWithChannel({ chatId: -1005 });
    await ingest(channelPost(-1005, { photo: true, caption: "Leather jacket, size L" }));
    await drainInlineTasks();
    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(p.status).toBe("draft");
    expect(p.needsPrice).toBe(true);
    expect(fake.callsTo("editMessageReplyMarkup")).toHaveLength(0);
    const receipt = fake.callsTo("sendMessage").find((c) => c.args[0] === Number(owner.telegramId));
    expect(String(receipt?.args[1])).toContain("What's the price?");
  });

  it("an edited caption saying SOLD marks the product sold and updates the button", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1006 });
    const post = channelPost(-1006, { photo: true, caption: "Samsung A54 25,000 birr" }) as { message_id: number };
    await ingest(post as never);
    await drainInlineTasks();
    await ingest(
      channelPost(-1006, { photo: true, caption: "Samsung A54 25,000 birr\nSOLD", messageId: post.message_id, editDate: 2 }),
      true,
    );
    await drainInlineTasks();
    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(p.status).toBe("sold");
    const last = fake.callsTo("editMessageReplyMarkup").at(-1)!;
    const kb = (last.args[2] as { reply_markup: { inline_keyboard: { text: string }[][] } }).reply_markup.inline_keyboard;
    expect(kb[0][0].text).toBe("Sold · see similar");
  });

  it("falls back to a reply card when the post can't be edited, and warns the seller", async () => {
    const { owner, shop, channel } = await makeShopWithChannel({ chatId: -1007 });
    fake.failNext("editMessageReplyMarkup", tgError(400, "Bad Request: message can't be edited"));
    await ingest(channelPost(-1007, { photo: true, caption: "Desk lamp 1,200 birr" }));
    await drainInlineTasks();
    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, p.id));
    expect(src.buttonMode).toBe("reply_card");
    expect(src.buttonStatus).toBe("synced");
    const warning = fake
      .callsTo("sendMessage")
      .find((c) => c.args[0] === Number(owner.telegramId) && String(c.args[1]).includes("can't add Order buttons"));
    expect(warning).toBeTruthy();
    const [ch] = await db.select().from(channels).where(eq(channels.id, channel.id));
    expect(ch.canEditMessages).toBe(false);
  });

  it("hides the listing when its post was deleted in Telegram", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1008 });
    await ingest(channelPost(-1008, { photo: true, caption: "Bike 8,000 birr" }));
    await drainInlineTasks();
    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));

    fake.failNext("editMessageReplyMarkup", tgError(400, "Bad Request: message to edit not found"));
    const fresh = await updateProduct(shop, p.id, { price: 750000n });
    await scheduleButtonSyncForProducts(shop.id, [fresh.id]);
    await drainInlineTasks();

    const [after] = await db.select().from(products).where(eq(products.id, p.id));
    expect(after.status).toBe("archived");
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, p.id));
    expect(src.buttonStatus).toBe("deleted");
  });

  it("retries on Telegram rate limits instead of failing", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1009 });
    fake.failNext("editMessageReplyMarkup", tgError(429, "Too Many Requests: retry after 1"));
    await ingest(channelPost(-1009, { photo: true, caption: "Kettle 900 birr" }));
    await drainInlineTasks();
    const [p] = await db.select().from(products).where(eq(products.shopId, shop.id));
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, p.id));
    expect(src.buttonStatus).toBe("synced");
    expect(fake.callsTo("editMessageReplyMarkup").length).toBe(2);
  });

  it("in groups, only admin posts become products", async () => {
    const { shop } = await makeShopWithChannel({ chatId: -1010, chatType: "supergroup" });
    const member = await makeUser("Member");
    const admin = await makeUser("Admin");
    fake.chatMembers.set(`-1010:${admin.telegramId}`, "administrator");
    await ingest(channelPost(-1010, { chatType: "supergroup", photo: true, caption: "Fake ad 100 birr", from: { id: Number(member.telegramId) } }));
    await ingest(channelPost(-1010, { chatType: "supergroup", photo: true, caption: "Real ad 300 birr", from: { id: Number(admin.telegramId) } }));
    await drainInlineTasks();
    const list = await db.select().from(products).where(eq(products.shopId, shop.id));
    expect(list.map((p) => p.title)).toEqual(["Real ad"]);
    // Groups get a reply card: bots can't edit members' messages.
    const [src] = await db.select().from(productSources).where(eq(productSources.productId, list[0].id));
    expect(src.buttonMode).toBe("reply_card");
  });
});
