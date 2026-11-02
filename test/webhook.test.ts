import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { FakeTelegram } from "./fake-telegram";
import { channelPost, makeShopWithChannel, nextUpdateId } from "./helpers";
import { db } from "@/server/db";
import { telegramUpdates } from "@/server/db/schema";
import { handleTelegramWebhook } from "@/server/bot/webhook";
import { resetInlineTasks } from "@/server/services/tasks";
import { serverEnv } from "@/server/env";

beforeAll(async () => {
  await createTestDb();
});

beforeEach(() => {
  resetInlineTasks();
  new FakeTelegram().install();
});

function hook(body: unknown, secret = serverEnv.TELEGRAM_WEBHOOK_SECRET ?? "") {
  return handleTelegramWebhook(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("telegram webhook", () => {
  it("rejects a missing or wrong secret", async () => {
    expect((await hook({ update_id: 1 }, "")).status).toBe(403);
    expect((await hook({ update_id: 1 }, "nope")).status).toBe(403);
  });

  it("rejects malformed JSON", async () => {
    expect((await hook("{not json")).status).toBe(400);
  });

  it("stores a listing post from a connected channel and acks fast", async () => {
    await makeShopWithChannel({ chatId: -2001 });
    const updateId = nextUpdateId();
    const res = await hook({ update_id: updateId, channel_post: channelPost(-2001, { photo: true, caption: "Shoes size 42\n1,800 birr" }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, BigInt(updateId)));
    expect(rows).toHaveLength(1);
  });

  it("is idempotent when Telegram redelivers the same update", async () => {
    await makeShopWithChannel({ chatId: -2002 });
    const updateId = nextUpdateId();
    const body = { update_id: updateId, channel_post: channelPost(-2002, { photo: true, caption: "Bag 900 birr" }) };
    expect((await hook(body)).status).toBe(200);
    expect((await hook(body)).status).toBe(200);
    const rows = await db.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, BigInt(updateId)));
    expect(rows).toHaveLength(1);
  });

  it("ignores posts from chats that are not connected", async () => {
    const updateId = nextUpdateId();
    const res = await hook({ update_id: updateId, channel_post: channelPost(-2999, { photo: true, caption: "Phone 10,000 birr" }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, BigInt(updateId)));
    expect(rows).toHaveLength(0);
  });

  it("ignores chatter that doesn't look like a listing", async () => {
    await makeShopWithChannel({ chatId: -2003 });
    const updateId = nextUpdateId();
    await hook({ update_id: updateId, channel_post: channelPost(-2003, { text: "Good morning everyone!" }) });
    const rows = await db.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, BigInt(updateId)));
    expect(rows).toHaveLength(0);
  });
});
