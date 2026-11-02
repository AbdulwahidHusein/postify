import "server-only";

import { and, asc, desc, eq, gt, gte, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  conversations,
  messages,
  productImages,
  products,
  shops,
  users,
  type Conversation,
  type Message,
} from "@/server/db/schema";
import { AppError, forbidden, notFound } from "@/server/http";
import { enqueue } from "@/server/services/tasks";
import { privateUrl } from "@/server/services/storage";
import { can } from "@/server/auth/authorize";
import { memberRole } from "@/server/domain/shops";
import { trackEvent } from "@/server/domain/analytics";
import { imageSrc } from "@/server/domain/products";

const MESSAGES_PER_HOUR = 30;

export async function startConversation(input: {
  shopId: string;
  productId: string | null;
  buyerUserId: string;
  sourceCode?: string | null;
}): Promise<Conversation> {
  const role = await memberRole(input.shopId, input.buyerUserId);
  if (role) throw new AppError("This is your own shop", 400, "own_shop");
  if (input.productId) {
    const p = await db.query.products.findFirst({
      where: and(eq(products.id, input.productId), eq(products.shopId, input.shopId)),
      columns: { id: true },
    });
    if (!p) throw notFound("Product not found");
  }
  const where = and(
    eq(conversations.shopId, input.shopId),
    eq(conversations.buyerUserId, input.buyerUserId),
    input.productId ? eq(conversations.productId, input.productId) : isNull(conversations.productId),
  );
  const existing = await db.query.conversations.findFirst({ where });
  if (existing) return existing;
  const [created] = await db
    .insert(conversations)
    .values({ shopId: input.shopId, productId: input.productId, buyerUserId: input.buyerUserId })
    .onConflictDoNothing()
    .returning();
  const row = created ?? (await db.query.conversations.findFirst({ where }));
  if (!row) throw new AppError("Could not start the conversation", 500);
  if (created) {
    await trackEvent({
      shopId: input.shopId,
      type: "inquiry_started",
      productId: input.productId,
      sourceCode: input.sourceCode ?? null,
      actorUserId: input.buyerUserId,
    });
  }
  return row;
}

export type ChatRole = "buyer" | "seller";

export async function conversationAccess(conversationId: string, userId: string) {
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conv) throw notFound("Conversation not found");
  if (conv.buyerUserId === userId) return { conv, role: "buyer" as const };
  const role = await memberRole(conv.shopId, userId);
  if (role && can(role, "inbox.manage")) return { conv, role: "seller" as const };
  throw forbidden();
}

export const sendSchema = z.object({
  body: z.string().trim().max(2000).default(""),
  clientId: z.string().max(64).optional(),
  imageKey: z.string().max(300).optional(),
});

export async function sendMessage(input: {
  conversationId: string;
  userId: string;
  role: ChatRole;
  body: string;
  clientId?: string | null;
  imageKey?: string | null;
  via?: "web" | "telegram";
}): Promise<Message> {
  const body = input.body.trim();
  if (!body && !input.imageKey) throw new AppError("Message is empty");
  if (input.imageKey && !input.imageKey.startsWith(`chat/${input.conversationId}/`)) {
    throw new AppError("Invalid attachment");
  }
  if (input.role === "buyer") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.senderUserId, input.userId),
          eq(messages.conversationId, input.conversationId),
          gte(messages.createdAt, new Date(Date.now() - 3600_000)),
        ),
      );
    if (Number(row?.n ?? 0) >= MESSAGES_PER_HOUR) {
      throw new AppError("You're sending messages too fast. Try again in a bit.", 429, "rate_limited");
    }
  }

  const message = await db.transaction(async (tx) => {
    if (input.clientId) {
      const dup = await tx.query.messages.findFirst({
        where: and(eq(messages.conversationId, input.conversationId), eq(messages.clientId, input.clientId)),
      });
      if (dup) return { msg: dup, fresh: false };
    }
    const [msg] = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderRole: input.role,
        senderUserId: input.userId,
        kind: input.imageKey ? "image" : "text",
        body,
        imageKey: input.imageKey ?? null,
        clientId: input.clientId ?? null,
      })
      .returning();
    const preview = body ? body.slice(0, 140) : "📷 Photo";
    await tx
      .update(conversations)
      .set({
        lastMessageAt: msg.createdAt,
        lastMessagePreview: preview,
        status: "open",
        ...(input.role === "buyer"
          ? { sellerUnread: sql`${conversations.sellerUnread} + 1` }
          : { buyerUnread: sql`${conversations.buyerUnread} + 1` }),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, input.conversationId));
    return { msg, fresh: true };
  });

  if (message.fresh) {
    await enqueue(
      "notify",
      { kind: input.role === "buyer" ? "seller_message" : "buyer_message", messageId: message.msg.id },
      { name: `chat:${message.msg.id}` },
    );
  }
  return message.msg;
}

export async function postSystemMessage(conversationId: string, body: string) {
  await db.insert(messages).values({ conversationId, senderRole: "system", body });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 140), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function listMessages(conversationId: string, after?: string | null) {
  const where: SQL[] = [eq(messages.conversationId, conversationId)];
  if (after) {
    const at = new Date(after);
    if (!Number.isNaN(at.getTime())) where.push(gt(messages.createdAt, at));
  }
  const rows = await db
    .select()
    .from(messages)
    .where(and(...where))
    .orderBy(asc(messages.createdAt))
    .limit(after ? 200 : 500);
  return Promise.all(rows.map(serializeMessage));
}

export async function markRead(conversationId: string, role: ChatRole) {
  await db
    .update(conversations)
    .set(role === "seller" ? { sellerUnread: 0 } : { buyerUnread: 0 })
    .where(eq(conversations.id, conversationId));
}

export async function closeConversation(conversationId: string) {
  await db.update(conversations).set({ status: "closed", updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

async function serializeMessage(m: Message) {
  return {
    id: m.id,
    role: m.senderRole,
    kind: m.kind,
    body: m.body,
    image: m.imageKey ? await privateUrl(m.imageKey) : null,
    clientId: m.clientId,
    createdAt: m.createdAt.toISOString(),
  };
}

export type SerializedMessage = Awaited<ReturnType<typeof serializeMessage>>;

async function coverFor(productId: string | null) {
  if (!productId) return null;
  const img = await db.query.productImages.findFirst({
    where: eq(productImages.productId, productId),
    orderBy: [asc(productImages.position)],
  });
  return img ? imageSrc(img, 320) : null;
}

export async function listSellerInbox(shopId: string, opts: { unread?: boolean; productId?: string } = {}) {
  const where: SQL[] = [eq(conversations.shopId, shopId)];
  if (opts.unread) where.push(gt(conversations.sellerUnread, 0));
  if (opts.productId) where.push(eq(conversations.productId, opts.productId));
  const rows = await db
    .select({ conv: conversations, buyer: users, product: products })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.buyerUserId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .where(and(...where))
    .orderBy(desc(conversations.sellerUnread), desc(conversations.lastMessageAt))
    .limit(200);
  return Promise.all(
    rows
      .filter((r) => r.conv.lastMessageAt)
      .map(async (r) => ({
        id: r.conv.id,
        status: r.conv.status,
        unread: r.conv.sellerUnread,
        preview: r.conv.lastMessagePreview,
        lastMessageAt: r.conv.lastMessageAt?.toISOString() ?? null,
        buyer: { name: [r.buyer.firstName, r.buyer.lastName].filter(Boolean).join(" "), username: r.buyer.username },
        product: r.product ? { id: r.product.id, title: r.product.title, image: await coverFor(r.product.id) } : null,
      })),
  );
}

export async function listBuyerInbox(userId: string) {
  const rows = await db
    .select({ conv: conversations, shop: shops, product: products })
    .from(conversations)
    .innerJoin(shops, eq(shops.id, conversations.shopId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .where(eq(conversations.buyerUserId, userId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  return Promise.all(
    rows.map(async (r) => ({
      id: r.conv.id,
      unread: r.conv.buyerUnread,
      preview: r.conv.lastMessagePreview,
      lastMessageAt: r.conv.lastMessageAt?.toISOString() ?? null,
      shop: { handle: r.shop.handle, name: r.shop.name },
      product: r.product ? { id: r.product.id, title: r.product.title, image: await coverFor(r.product.id) } : null,
    })),
  );
}

export async function unreadForShop(shopId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${conversations.sellerUnread}), 0)::int` })
    .from(conversations)
    .where(eq(conversations.shopId, shopId));
  return Number(row?.n ?? 0);
}

export async function conversationHeader(conv: Conversation) {
  const [shop, product, buyer] = await Promise.all([
    db.query.shops.findFirst({ where: eq(shops.id, conv.shopId) }),
    conv.productId ? db.query.products.findFirst({ where: eq(products.id, conv.productId), with: { variants: true } }) : null,
    db.query.users.findFirst({ where: eq(users.id, conv.buyerUserId) }),
  ]);
  return {
    id: conv.id,
    status: conv.status,
    shop: shop ? { handle: shop.handle, name: shop.name } : null,
    buyer: buyer ? { name: [buyer.firstName, buyer.lastName].filter(Boolean).join(" "), username: buyer.username } : null,
    product: product
      ? {
          id: product.id,
          slug: product.slug,
          title: product.title,
          status: product.status,
          priceMinor: product.variants[0]?.priceMinor?.toString() ?? null,
          currency: product.variants[0]?.currency ?? "ETB",
          image: await coverFor(product.id),
        }
      : null,
  };
}
