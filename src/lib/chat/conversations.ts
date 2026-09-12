import "server-only";

import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  messageDeliveries,
  messages,
  products,
  shops,
  users,
  type Conversation,
  type Message,
} from "@/db/schema";
import { productImageSrc } from "@/lib/products";

export const MAX_MESSAGE_LENGTH = 2000;
export const RATE_LIMIT_PER_HOUR = 40;

export class ChatError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function previewOf(body: string, imageUrl?: string | null) {
  if (imageUrl && !body.trim()) return "Photo";
  if (imageUrl) return `Photo · ${body.trim().slice(0, 80)}`;
  const t = body.trim().replace(/\s+/g, " ");
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderRole: m.senderRole,
    senderUserId: m.senderUserId,
    kind: m.kind ?? "text",
    body: m.body,
    imageUrl: m.imageUrl,
    clientId: m.clientId,
    createdAt: m.createdAt.toISOString(),
  };
}

function productCard(product: {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  price: string | null;
  currency: string;
  status: string;
  images?: { url: string | null; telegramFileId: string | null; alt: string | null }[];
}) {
  const img = product.images?.[0];
  const desc = product.description?.trim() || null;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: desc
      ? desc.length > 220
        ? `${desc.slice(0, 217)}…`
        : desc
      : null,
    price: product.price != null ? Number(product.price) : null,
    currency: product.currency,
    status: product.status,
    imageSrc: img ? productImageSrc(img) : null,
  };
}

export function serializeConversation(
  row: Conversation & {
    product?: Parameters<typeof productCard>[0] & {
      images?: {
        url: string | null;
        telegramFileId: string | null;
        alt: string | null;
        sortOrder: number;
      }[];
    };
    shop?: { id: string; name: string; slug: string };
    buyer?: {
      id: string;
      firstName: string;
      lastName: string | null;
      username: string | null;
      photoUrl: string | null;
    };
  },
  viewer: "buyer" | "seller",
) {
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    buyerUserId: row.buyerUserId,
    status: row.status,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: row.lastMessagePreview,
    unread:
      viewer === "seller" ? row.sellerUnreadCount : row.buyerUnreadCount,
    product: row.product ? productCard(row.product) : null,
    shop: row.shop
      ? { id: row.shop.id, name: row.shop.name, slug: row.shop.slug }
      : null,
    buyer: row.buyer
      ? {
          id: row.buyer.id,
          firstName: row.buyer.firstName,
          lastName: row.buyer.lastName,
          username: row.buyer.username,
          photoUrl: row.buyer.photoUrl,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateProductConversation(input: {
  productId: string;
  buyerUserId: string;
}) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
    with: {
      shop: true,
      images: {
        orderBy: (img, { asc: o }) => [o(img.sortOrder)],
        limit: 1,
      },
    },
  });
  if (!product) throw new ChatError("Product not found", 404);
  if (product.status === "draft" || product.status === "archived") {
    throw new ChatError("This product is not available", 404);
  }
  if (product.shop.ownerUserId === input.buyerUserId) {
    throw new ChatError("You cannot message your own listing", 400);
  }

  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.shopId, product.shopId),
      eq(conversations.productId, product.id),
      eq(conversations.buyerUserId, input.buyerUserId),
    ),
    with: {
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      shop: true,
      buyer: true,
    },
  });
  if (existing) {
    return { conversation: existing, product, created: false };
  }

  const [created] = await db
    .insert(conversations)
    .values({
      shopId: product.shopId,
      productId: product.id,
      buyerUserId: input.buyerUserId,
      status: "open",
    })
    .onConflictDoNothing({
      target: [
        conversations.shopId,
        conversations.productId,
        conversations.buyerUserId,
      ],
    })
    .returning();

  if (!created) {
    // Concurrent create won the race (buyer double-tapped order/message) —
    // the unique (shop, product, buyer) index made our insert a no-op.
    // Re-fetch the winner with relations instead of throwing a 500.
    const winner = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.shopId, product.shopId),
        eq(conversations.productId, product.id),
        eq(conversations.buyerUserId, input.buyerUserId),
      ),
      with: {
        product: {
          with: {
            images: {
              orderBy: (img, { asc: o }) => [o(img.sortOrder)],
              limit: 1,
            },
          },
        },
        shop: true,
        buyer: true,
      },
    });
    if (!winner) throw new ChatError("Could not create conversation", 500);
    return { conversation: winner, product, created: false };
  }

  const full = await db.query.conversations.findFirst({
    where: eq(conversations.id, created.id),
    with: {
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      shop: true,
      buyer: true,
    },
  });
  if (!full) throw new ChatError("Could not create conversation", 500);

  const priceLabel =
    product.price != null
      ? `${product.currency} ${Number(product.price).toLocaleString()}`
      : "Ask for price";
  const desc = product.description?.trim();
  const img = product.images?.[0]
    ? productImageSrc(product.images[0])
    : null;
  const cardBody = [
    product.title,
    priceLabel,
    desc
      ? desc.length > 280
        ? `${desc.slice(0, 277)}…`
        : desc
      : null,
    product.status === "sold" ? "Status: Sold" : null,
  ]
    .filter(Boolean)
    .join("\n");

  await db.insert(messages).values({
    conversationId: full.id,
    senderRole: "system",
    senderUserId: null,
    kind: "product",
    body: cardBody,
    imageUrl: img,
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: product.title,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, full.id));

  if (product.status === "sold") {
    await insertSystemMessage(
      full.id,
      "This item is marked sold. You can still ask the seller about similar items.",
    );
  }

  return { conversation: full, product, created: true };
}

export async function insertSystemMessage(conversationId: string, body: string) {
  const now = new Date();
  await db.insert(messages).values({
    conversationId,
    senderRole: "system",
    senderUserId: null,
    kind: "text",
    body,
  });
  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: previewOf(body),
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationId));
}

export async function assertConversationAccess(
  conversationId: string,
  userId: string,
) {
  const row = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      shop: true,
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      buyer: true,
    },
  });
  if (!row) throw new ChatError("Conversation not found", 404);

  const isBuyer = row.buyerUserId === userId;
  const isSeller = row.shop.ownerUserId === userId;
  if (!isBuyer && !isSeller) throw new ChatError("Forbidden", 403);

  return {
    conversation: row,
    role: (isSeller ? "seller" : "buyer") as "seller" | "buyer",
  };
}

async function checkRateLimit(userId: string, shopId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.senderUserId, userId),
        eq(conversations.shopId, shopId),
        gt(messages.createdAt, since),
      ),
    );
  if (count >= RATE_LIMIT_PER_HOUR) {
    throw new ChatError("Too many messages. Try again in a bit.", 429);
  }
}

export async function sendMessage(input: {
  conversationId: string;
  userId: string;
  body?: string;
  imageUrl?: string | null;
  clientId?: string | null;
}) {
  const body = (input.body ?? "").trim();
  const imageUrl = input.imageUrl?.trim() || null;
  if (!body && !imageUrl) throw new ChatError("Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(`Message too long (max ${MAX_MESSAGE_LENGTH})`);
  }

  const { conversation, role } = await assertConversationAccess(
    input.conversationId,
    input.userId,
  );

  if (input.clientId) {
    const dup = await db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, conversation.id),
        eq(messages.clientId, input.clientId),
      ),
    });
    if (dup) return { message: dup, conversation, role, duplicate: true };
  }

  await checkRateLimit(input.userId, conversation.shopId);

  const wasClosed = conversation.status === "closed";
  const now = new Date();
  const kind = imageUrl ? "image" : "text";

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderRole: role,
      senderUserId: input.userId,
      kind,
      body: body || (imageUrl ? "" : ""),
      imageUrl,
      clientId: input.clientId ?? null,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      status: "open",
      lastMessageAt: now,
      lastMessagePreview: previewOf(body, imageUrl),
      // Atomic increment: read-modify-write (+1 in JS) loses updates when two
      // messages land concurrently — the second overwrites the first's count.
      ...(role === "buyer"
        ? { sellerUnreadCount: sql`${conversations.sellerUnreadCount} + 1` }
        : {}),
      ...(role === "seller"
        ? { buyerUnreadCount: sql`${conversations.buyerUnreadCount} + 1` }
        : {}),
      updatedAt: now,
    })
    .where(eq(conversations.id, conversation.id));

  if (wasClosed && role === "buyer") {
    await insertSystemMessage(conversation.id, "Conversation reopened.");
  }

  return { message, conversation, role, duplicate: false };
}

export async function listMessages(input: {
  conversationId: string;
  userId: string;
  after?: string | null;
  limit?: number;
}) {
  const { conversation, role } = await assertConversationAccess(
    input.conversationId,
    input.userId,
  );
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

  let afterDate: Date | null = null;
  if (input.after) {
    const anchor = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, input.after),
        eq(messages.conversationId, conversation.id),
      ),
    });
    afterDate = anchor?.createdAt ?? null;
  }

  const rows = await db.query.messages.findMany({
    where: afterDate
      ? and(
          eq(messages.conversationId, conversation.id),
          gt(messages.createdAt, afterDate),
        )
      : eq(messages.conversationId, conversation.id),
    orderBy: [asc(messages.createdAt)],
    limit,
  });

  // Mark read for viewer
  if (role === "seller" && conversation.sellerUnreadCount > 0 && !input.after) {
    await db
      .update(conversations)
      .set({ sellerUnreadCount: 0, updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
  }
  if (role === "buyer" && conversation.buyerUnreadCount > 0 && !input.after) {
    await db
      .update(conversations)
      .set({ buyerUnreadCount: 0, updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
  }

  return { messages: rows, role, conversation };
}

export async function listSellerInbox(input: {
  shopId: string;
  ownerUserId: string;
  unreadOnly?: boolean;
  productId?: string | null;
  limit?: number;
}) {
  const shop = await db.query.shops.findFirst({
    where: and(eq(shops.id, input.shopId), eq(shops.ownerUserId, input.ownerUserId)),
  });
  if (!shop) throw new ChatError("Shop not found", 404);

  const conditions = [eq(conversations.shopId, shop.id)];
  if (input.unreadOnly) {
    conditions.push(gt(conversations.sellerUnreadCount, 0));
  }
  if (input.productId) {
    conditions.push(eq(conversations.productId, input.productId));
  }

  const rows = await db.query.conversations.findMany({
    where: and(...conditions),
    with: {
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      shop: true,
      buyer: true,
    },
    orderBy: [desc(conversations.lastMessageAt), desc(conversations.updatedAt)],
    limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });

  return rows;
}

export async function listBuyerInbox(input: {
  buyerUserId: string;
  limit?: number;
}) {
  return db.query.conversations.findMany({
    where: eq(conversations.buyerUserId, input.buyerUserId),
    with: {
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      shop: true,
      buyer: true,
    },
    orderBy: [desc(conversations.lastMessageAt), desc(conversations.updatedAt)],
    limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
}

export async function closeConversation(input: {
  conversationId: string;
  userId: string;
}) {
  const { conversation, role } = await assertConversationAccess(
    input.conversationId,
    input.userId,
  );
  if (role !== "seller") throw new ChatError("Only the seller can close", 403);

  await db
    .update(conversations)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  await insertSystemMessage(conversation.id, "Seller closed this conversation.");
  return conversation;
}

export async function findConversationByTelegramReply(input: {
  telegramChatId: bigint;
  telegramMessageId: number;
}) {
  const delivery = await db.query.messageDeliveries.findFirst({
    where: and(
      eq(messageDeliveries.telegramChatId, input.telegramChatId),
      eq(messageDeliveries.telegramMessageId, input.telegramMessageId),
    ),
    with: {
      message: true,
    },
  });
  if (!delivery?.message) return null;

  return db.query.conversations.findFirst({
    where: eq(conversations.id, delivery.message.conversationId),
    with: {
      shop: { with: { owner: true } },
      product: true,
      buyer: true,
    },
  });
}

export async function countSellerUnread(shopId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${conversations.sellerUnreadCount}), 0)::int`,
    })
    .from(conversations)
    .where(eq(conversations.shopId, shopId));
  return row?.total ?? 0;
}

export async function getUserByTelegramId(telegramId: bigint) {
  return (
    (await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId),
    })) ?? null
  );
}
