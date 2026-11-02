import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { channels, shopMembers, shops, type Channel, type Shop } from "@/server/db/schema";
import { log } from "@/server/log";
import { tg, classifyTelegramError } from "@/server/services/telegram";
import { createShop } from "@/server/domain/shops";

export type ChatInfo = {
  id: number | bigint;
  type: string;
  title?: string | null;
  username?: string | null;
};

export type LinkResult =
  | { status: "linked"; shop: Shop; channel: Channel; createdShop: boolean }
  | { status: "already_linked"; shop: Shop; channel: Channel }
  | { status: "conflict" }
  | { status: "not_admin" }
  | { status: "unsupported" };

export function isLinkableType(type: string | undefined | null): type is "channel" | "group" | "supergroup" {
  return type === "channel" || type === "group" || type === "supergroup";
}

export function isGroupType(type: string | null | undefined) {
  return type === "group" || type === "supergroup";
}

export type BotRights = {
  botIsAdmin: boolean;
  canPostMessages: boolean;
  canEditMessages: boolean;
};

/** Ask Telegram what the bot may do in this chat right now. */
export async function fetchBotRights(chatId: bigint | number): Promise<BotRights> {
  const me = await tg().getMe();
  const member = await tg().getChatMember(Number(chatId), me.id);
  if (member.status === "administrator") {
    return {
      botIsAdmin: true,
      canPostMessages: Boolean(member.can_post_messages ?? true),
      canEditMessages: Boolean(member.can_edit_messages ?? false),
    };
  }
  if (member.status === "creator") {
    return { botIsAdmin: true, canPostMessages: true, canEditMessages: true };
  }
  return { botIsAdmin: false, canPostMessages: false, canEditMessages: false };
}

/** Verify through Telegram that a user really administers a chat. */
export async function userIsChatAdmin(chatId: bigint | number, telegramUserId: number): Promise<boolean> {
  try {
    const m = await tg().getChatMember(Number(chatId), telegramUserId);
    return m.status === "creator" || m.status === "administrator";
  } catch (err) {
    log.warn("getChatMember failed", { chat_id: String(chatId), err: classifyTelegramError(err).description });
    return false;
  }
}

/**
 * Link a Telegram chat to one of the user's shops. Telegram verifies admin
 * status for chat-picker shares; for every other path we check it ourselves.
 * A chat already linked to a shop the user is not a member of is a conflict.
 */
export async function linkChat(input: {
  userId: string;
  telegramUserId: number;
  chat: ChatInfo;
  adminVerified?: boolean;
}): Promise<LinkResult> {
  const { chat } = input;
  if (!isLinkableType(chat.type)) return { status: "unsupported" };
  const chatId = BigInt(chat.id);

  if (!input.adminVerified && !(await userIsChatAdmin(chatId, input.telegramUserId))) {
    return { status: "not_admin" };
  }

  let rights: BotRights = { botIsAdmin: false, canPostMessages: false, canEditMessages: false };
  try {
    rights = await fetchBotRights(chatId);
  } catch (err) {
    log.warn("fetchBotRights failed", { chat_id: chatId, err: classifyTelegramError(err).description });
  }

  const existing = await db.query.channels.findFirst({ where: eq(channels.telegramChatId, chatId) });
  const myShops = await db
    .select({ shop: shops, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, input.userId), inArray(shopMembers.role, ["owner", "admin"])))
    .orderBy(asc(shopMembers.createdAt));

  const fields = {
    chatType: chat.type,
    title: chat.title ?? null,
    username: chat.username ?? null,
    status: "connected" as const,
    ...rights,
    updatedAt: new Date(),
  };

  if (existing) {
    const mine = myShops.find((s) => s.shop.id === existing.shopId);
    if (!mine) return { status: "conflict" };
    const [channel] = await db
      .update(channels)
      .set({ ...fields, ...(existing.status === "disconnected" ? { connectedAt: new Date() } : {}) })
      .where(eq(channels.id, existing.id))
      .returning();
    return { status: "already_linked", shop: mine.shop, channel };
  }

  // Prefer a shop with no linked chat yet; otherwise create one named after the chat.
  const linkedShopIds = new Set(
    (
      await db
        .select({ shopId: channels.shopId })
        .from(channels)
        .where(inArray(channels.shopId, myShops.map((s) => s.shop.id).concat(["00000000-0000-0000-0000-000000000000"])))
    ).map((r) => r.shopId),
  );
  let shop = myShops.find((s) => !linkedShopIds.has(s.shop.id))?.shop;
  let createdShop = false;
  if (!shop) {
    shop = await createShop({ ownerUserId: input.userId, name: chat.title?.trim() || "My shop" });
    createdShop = true;
  }

  const [channel] = await db
    .insert(channels)
    .values({
      shopId: shop.id,
      telegramChatId: chatId,
      connectedByUserId: input.userId,
      ...fields,
    })
    .onConflictDoNothing({ target: channels.telegramChatId })
    .returning();
  if (!channel) {
    // Lost a race with a concurrent link of the same chat.
    const again = await db.query.channels.findFirst({ where: eq(channels.telegramChatId, chatId) });
    if (again?.shopId === shop.id) return { status: "already_linked", shop, channel: again };
    return { status: "conflict" };
  }
  return { status: "linked", shop, channel, createdShop };
}

export async function refreshChannelRights(channel: Channel): Promise<Channel> {
  const rights = await fetchBotRights(channel.telegramChatId);
  const [updated] = await db
    .update(channels)
    .set({ ...rights, ...(rights.canEditMessages ? { rightsWarnedAt: null } : {}), updatedAt: new Date() })
    .where(eq(channels.id, channel.id))
    .returning();
  return updated;
}

export async function markChatDisconnected(chatId: bigint) {
  await db
    .update(channels)
    .set({ status: "disconnected", botIsAdmin: false, canEditMessages: false, canPostMessages: false, updatedAt: new Date() })
    .where(eq(channels.telegramChatId, chatId));
}

export async function getChannelByChatId(chatId: bigint) {
  return (await db.query.channels.findFirst({ where: eq(channels.telegramChatId, chatId) })) ?? null;
}

export async function listChannels(shopId: string) {
  return db.query.channels.findMany({
    where: eq(channels.shopId, shopId),
    orderBy: [asc(channels.connectedAt)],
  });
}

export async function disconnectChannel(shopId: string, channelId: string) {
  const [row] = await db
    .update(channels)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(and(eq(channels.id, channelId), eq(channels.shopId, shopId)))
    .returning();
  if (row) {
    try {
      await tg().leaveChat(Number(row.telegramChatId));
    } catch {
      // Already removed or no access; disconnecting locally is what matters.
    }
  }
  return row ?? null;
}

export function serializeChannel(c: Channel) {
  return {
    id: c.id,
    chatId: c.telegramChatId.toString(),
    chatType: c.chatType,
    title: c.title,
    username: c.username,
    status: c.status,
    botIsAdmin: c.botIsAdmin,
    canPostMessages: c.canPostMessages,
    canEditMessages: c.canEditMessages,
    lastPostAt: c.lastPostAt?.toISOString() ?? null,
    connectedAt: c.connectedAt.toISOString(),
  };
}
