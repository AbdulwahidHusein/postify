import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  channels,
  shops,
  users,
  type Channel,
  type Shop,
} from "@/db/schema";
import { ensureDefaultShop, getOwnedShop } from "@/lib/shops";

const CODE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export function generateConnectCode(): string {
  const raw = randomBytes(4).toString("hex").toUpperCase();
  return `PFY-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function extractConnectCode(text: string): string | null {
  const match = text.toUpperCase().match(/\bPFY-[A-F0-9]{4}-[A-F0-9]{4}\b/);
  return match?.[0] ?? null;
}

export async function issueConnectCode(
  shopId: string,
  ownerUserId: string,
): Promise<{ shop: Shop; code: string; expiresAt: Date }> {
  const shop = await getOwnedShop(shopId, ownerUserId);
  if (!shop) {
    throw new Error("Shop not found");
  }

  const code = generateConnectCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const [updated] = await db
    .update(shops)
    .set({
      connectCode: code,
      connectCodeExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id))
    .returning();

  return { shop: updated!, code, expiresAt };
}

export async function findShopByConnectCode(code: string): Promise<Shop | null> {
  const normalized = code.toUpperCase();
  const shop = await db.query.shops.findFirst({
    where: and(
      eq(shops.connectCode, normalized),
      isNotNull(shops.connectCodeExpiresAt),
      gt(shops.connectCodeExpiresAt, new Date()),
    ),
  });
  return shop ?? null;
}

export async function clearConnectCode(shopId: string) {
  await db
    .update(shops)
    .set({
      connectCode: null,
      connectCodeExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shopId));
}

export async function connectChannelToShop(input: {
  shopId: string;
  telegramChatId: bigint;
  title?: string;
  username?: string;
}): Promise<Channel> {
  const existingByChat = await db.query.channels.findFirst({
    where: eq(channels.telegramChatId, input.telegramChatId),
  });

  if (existingByChat && existingByChat.shopId !== input.shopId) {
    throw new Error("This channel is already linked to another shop");
  }

  if (existingByChat) {
    const [updated] = await db
      .update(channels)
      .set({
        title: input.title ?? existingByChat.title,
        username: input.username ?? existingByChat.username,
        status: "connected",
        connectedAt: existingByChat.connectedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channels.id, existingByChat.id))
      .returning();
    await clearConnectCode(input.shopId);
    return updated!;
  }

  const existingForShop = await db.query.channels.findFirst({
    where: eq(channels.shopId, input.shopId),
  });
  if (existingForShop) {
    await db.delete(channels).where(eq(channels.id, existingForShop.id));
  }

  const [created] = await db
    .insert(channels)
    .values({
      shopId: input.shopId,
      telegramChatId: input.telegramChatId,
      title: input.title ?? null,
      username: input.username ?? null,
      status: "connected",
    })
    .returning();

  await clearConnectCode(input.shopId);
  return created!;
}

export type LinkChannelResult =
  | {
      status: "connected";
      shop: Shop;
      channel: Channel;
      fresh: boolean;
    }
  | {
      status: "already_connected";
      shop: Shop;
      channel: Channel;
    }
  | { status: "conflict" }
  | { status: "no_account" };

/**
 * Idempotent link: Telegram user → their shop ↔ channel.
 * Prefer a shop with no channel; otherwise ensureDefaultShop.
 */
export async function linkChannelForTelegramUser(input: {
  telegramUserId: bigint;
  telegramChatId: bigint;
  title?: string | null;
  username?: string | null;
}): Promise<LinkChannelResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, input.telegramUserId),
  });
  if (!user) return { status: "no_account" };

  const existingByChat = await db.query.channels.findFirst({
    where: eq(channels.telegramChatId, input.telegramChatId),
    with: { shop: true },
  });

  if (existingByChat?.shop) {
    if (existingByChat.shop.ownerUserId === user.id) {
      const channel = await connectChannelToShop({
        shopId: existingByChat.shopId,
        telegramChatId: input.telegramChatId,
        title: input.title ?? undefined,
        username: input.username ?? undefined,
      });
      return {
        status: "already_connected",
        shop: existingByChat.shop,
        channel,
      };
    }
    return { status: "conflict" };
  }

  const owned = await db.query.shops.findMany({
    where: eq(shops.ownerUserId, user.id),
    with: { channels: true },
    orderBy: (t, { asc: a }) => [a(t.createdAt)],
  });

  let shop: Shop | undefined =
    owned.find((s) => s.channels.length === 0) ?? owned[0];
  if (!shop) {
    shop = await ensureDefaultShop(user.id);
  }

  const before = await db.query.channels.findFirst({
    where: and(
      eq(channels.shopId, shop.id),
      eq(channels.telegramChatId, input.telegramChatId),
    ),
  });

  const channel = await connectChannelToShop({
    shopId: shop.id,
    telegramChatId: input.telegramChatId,
    title: input.title ?? undefined,
    username: input.username ?? undefined,
  });

  const freshShop =
    (await db.query.shops.findFirst({ where: eq(shops.id, shop.id) })) ?? shop;

  if (before) {
    return {
      status: "already_connected",
      shop: freshShop,
      channel,
    };
  }

  return {
    status: "connected",
    shop: freshShop,
    channel,
    fresh: true,
  };
}

export async function getChannelByTelegramChatId(
  telegramChatId: bigint,
): Promise<Channel | null> {
  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.telegramChatId, telegramChatId),
      eq(channels.status, "connected"),
    ),
  });
  return channel ?? null;
}

export async function touchChannelPost(
  channelId: string,
  messageId: number,
) {
  await db
    .update(channels)
    .set({
      lastPostAt: new Date(),
      lastPostMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId));
}

export async function listChannelsForShop(shopId: string): Promise<Channel[]> {
  return db.query.channels.findMany({
    where: eq(channels.shopId, shopId),
  });
}

export async function listChannelsForOwner(ownerUserId: string) {
  const ownedShops = await db.query.shops.findMany({
    where: eq(shops.ownerUserId, ownerUserId),
    with: { channels: true },
  });

  return ownedShops.flatMap((shop) =>
    shop.channels.map((channel) => ({
      ...channel,
      shop: { id: shop.id, name: shop.name, slug: shop.slug },
    })),
  );
}

export function serializeChannel(
  channel: Channel & {
    shop?: { id: string; name: string; slug: string };
  },
) {
  return {
    id: channel.id,
    shopId: channel.shopId,
    telegramChatId: channel.telegramChatId.toString(),
    title: channel.title,
    username: channel.username,
    status: channel.status,
    lastPostAt: channel.lastPostAt?.toISOString() ?? null,
    lastPostMessageId: channel.lastPostMessageId,
    connectedAt: channel.connectedAt.toISOString(),
    shop: channel.shop,
  };
}

/** Stable opaque hint for logs (not reversible to chat id). */
export function chatFingerprint(chatId: bigint | number | string) {
  return createHash("sha256").update(String(chatId)).digest("hex").slice(0, 8);
}
