import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { createShop } from "@/server/domain/shops";
import { linkChat } from "@/server/domain/channels";

let tg = 5000;
export async function makeUser(name = "Seller") {
  tg += 1;
  const [u] = await db.insert(users).values({ telegramId: BigInt(tg), firstName: name }).returning();
  return u;
}

export async function makeShopWithChannel(opts: { chatId: number; chatType?: string; name?: string } ) {
  const owner = await makeUser("Owner");
  await createShop({ ownerUserId: owner.id, name: opts.name ?? "Abel Phones" });
  const res = await linkChat({
    userId: owner.id,
    telegramUserId: Number(owner.telegramId),
    chat: { id: opts.chatId, type: opts.chatType ?? "channel", title: "Abel Phones Channel", username: "abelphones" },
    adminVerified: true,
  });
  if (res.status !== "linked") throw new Error(`link failed: ${res.status}`);
  return { owner, shop: res.shop, channel: res.channel };
}

let updateId = 1;
export function nextUpdateId() {
  updateId += 1;
  return updateId;
}

let messageId = 100;
export function channelPost(chatId: number, opts: { caption?: string; photo?: boolean; mediaGroupId?: string; text?: string; from?: { id: number }; chatType?: string; messageId?: number; editDate?: number }) {
  messageId += 1;
  const id = opts.messageId ?? messageId;
  return {
    message_id: id,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: opts.chatType ?? "channel", title: "Chat" },
    ...(opts.from ? { from: { id: opts.from.id, is_bot: false, first_name: "U" } } : {}),
    ...(opts.caption !== undefined ? { caption: opts.caption } : {}),
    ...(opts.text !== undefined ? { text: opts.text } : {}),
    ...(opts.photo ? { photo: [{ file_id: `small-${id}`, file_unique_id: `s${id}`, width: 90, height: 90, file_size: 100 }, { file_id: `big-${id}`, file_unique_id: `b${id}`, width: 1280, height: 960, file_size: 90000 }] } : {}),
    ...(opts.mediaGroupId ? { media_group_id: opts.mediaGroupId } : {}),
    ...(opts.editDate ? { edit_date: opts.editDate } : {}),
  } as never;
}
