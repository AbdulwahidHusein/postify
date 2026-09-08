import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, shops } from "@/db/schema";
import {
  getOrCreateProductConversation,
  insertSystemMessage,
} from "@/lib/chat/conversations";
import { enqueueOrderNotify } from "@/lib/chat/outbox";
import { productImageSrc } from "@/lib/products";

const ORDER_RATE_PER_DAY = 8;

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderError";
    this.status = status;
  }
}

export type OrderStatus = "new" | "confirmed" | "fulfilled" | "cancelled";

async function checkOrderRateLimit(buyerUserId: string, shopId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.buyerUserId, buyerUserId),
        eq(orders.shopId, shopId),
        gt(orders.createdAt, since),
      ),
    );
  if (count >= ORDER_RATE_PER_DAY) {
    throw new OrderError(
      "Too many order requests today. Try again tomorrow.",
      429,
    );
  }
}

export async function createOrderIntent(input: {
  productId: string;
  buyerUserId: string;
  buyerName: string;
  buyerPhone: string;
  notes?: string | null;
  quantity?: number;
}) {
  const name = input.buyerName.trim();
  const phone = input.buyerPhone.trim();
  const notes = input.notes?.trim() || null;
  const quantity = Math.min(99, Math.max(1, input.quantity ?? 1));

  if (name.length < 2) throw new OrderError("Name is required");
  if (phone.length < 6) throw new OrderError("Phone number is required");
  if (notes && notes.length > 1000) throw new OrderError("Notes too long");

  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
    with: {
      shop: true,
    },
  });
  if (!product?.shop) throw new OrderError("Product not found", 404);
  if (product.status === "archived" || product.status === "draft") {
    throw new OrderError("This product is not available", 400);
  }
  if (product.shop.ownerUserId === input.buyerUserId) {
    throw new OrderError("You cannot order from your own shop", 400);
  }

  await checkOrderRateLimit(input.buyerUserId, product.shopId);

  const { conversation } = await getOrCreateProductConversation({
    productId: product.id,
    buyerUserId: input.buyerUserId,
  });

  const [order] = await db
    .insert(orders)
    .values({
      shopId: product.shopId,
      productId: product.id,
      buyerUserId: input.buyerUserId,
      conversationId: conversation.id,
      status: "new",
      quantity,
      buyerName: name,
      buyerPhone: phone,
      notes,
      unitPrice: product.price,
      currency: product.currency || "ETB",
    })
    .returning();

  const priceLabel =
    product.price != null
      ? `${product.currency} ${Number(product.price).toLocaleString()}`
      : "Ask for price";

  await insertSystemMessage(
    conversation.id,
    `Order request · qty ${quantity} · ${priceLabel}\n${name} · ${phone}${
      notes ? `\n${notes}` : ""
    }`,
  );

  await enqueueOrderNotify({ orderId: order!.id });

  return { order: order!, conversationId: conversation.id, product };
}

export async function listShopOrders(input: {
  shopSlug: string;
  ownerUserId: string;
  status?: OrderStatus | "all";
}) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.slug, input.shopSlug),
  });
  if (!shop) throw new OrderError("Shop not found", 404);
  if (shop.ownerUserId !== input.ownerUserId) {
    throw new OrderError("Forbidden", 403);
  }

  const status = input.status && input.status !== "all" ? input.status : null;

  const rows = await db.query.orders.findMany({
    where: status
      ? and(eq(orders.shopId, shop.id), eq(orders.status, status))
      : eq(orders.shopId, shop.id),
    with: {
      product: {
        with: {
          images: { limit: 1 },
        },
      },
      buyer: true,
    },
    orderBy: [desc(orders.createdAt)],
    limit: 100,
  });

  return { shop, orders: rows };
}

export async function updateOrderStatus(input: {
  orderId: string;
  ownerUserId: string;
  status: OrderStatus;
}) {
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
    with: { shop: true },
  });
  if (!row?.shop) throw new OrderError("Order not found", 404);
  if (row.shop.ownerUserId !== input.ownerUserId) {
    throw new OrderError("Forbidden", 403);
  }

  const [updated] = await db
    .update(orders)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(orders.id, input.orderId))
    .returning();

  if (row.conversationId) {
    const label =
      input.status === "confirmed"
        ? "Seller confirmed your order."
        : input.status === "fulfilled"
          ? "Seller marked this order fulfilled."
          : input.status === "cancelled"
            ? "Seller cancelled this order."
            : null;
    if (label) await insertSystemMessage(row.conversationId, label);
  }

  return updated!;
}

export function serializeOrder(row: {
  id: string;
  status: OrderStatus;
  quantity: number;
  buyerName: string;
  buyerPhone: string;
  notes: string | null;
  unitPrice: string | null;
  currency: string;
  createdAt: Date;
  conversationId: string | null;
  product?: {
    id: string;
    title: string;
    slug: string;
    images?: Parameters<typeof productImageSrc>[0][];
  } | null;
  buyer?: {
    id: string;
    firstName: string;
    username: string | null;
  } | null;
}) {
  const cover = row.product?.images?.[0]
    ? productImageSrc(row.product.images[0])
    : null;
  return {
    id: row.id,
    status: row.status,
    quantity: row.quantity,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    notes: row.notes,
    unitPrice: row.unitPrice,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    conversationId: row.conversationId,
    product: row.product
      ? {
          id: row.product.id,
          title: row.product.title,
          slug: row.product.slug,
          imageSrc: cover,
        }
      : null,
    buyer: row.buyer
      ? {
          id: row.buyer.id,
          firstName: row.buyer.firstName,
          username: row.buyer.username,
        }
      : null,
  };
}
