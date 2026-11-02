import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import {
  cartLines,
  carts,
  customers,
  orderLines,
  orders,
  payments,
  productImages,
  productVariants,
  products,
  shops,
  type Order,
  type OrderStatus,
  type Shop,
} from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { shortCode } from "@/server/ids";
import { enqueue } from "@/server/services/tasks";
import { normalizePhone } from "@/lib/phone";
import { normalizeSettings } from "@/server/domain/shops";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";
import { trackEvent } from "@/server/domain/analytics";
import { imageUrl } from "@/server/services/storage";

// ── checkout ────────────────────────────────────────────────────────────────
export const checkoutSchema = z.object({
  contactName: z.string().trim().min(2, "Enter your name").max(80),
  contactPhone: z.string().trim().min(6, "Enter your phone number").max(30),
  fulfillment: z.enum(["delivery", "pickup"]),
  address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  paymentMethod: z.enum(["on_delivery", "online"]),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

const MAX_ORDERS_PER_HOUR_PER_BUYER = 5;

export async function placeOrder(input: {
  shop: Shop;
  ownerKey: string;
  buyerUserId: string | null;
  checkout: CheckoutInput;
}): Promise<Order> {
  const { shop, checkout } = input;
  if (shop.status !== "active") throw new AppError("This shop isn't taking orders right now", 409);
  if (checkout.paymentMethod === "online") {
    throw new AppError("Online payment is coming soon. Please choose Pay on delivery.", 400, "online_unavailable");
  }
  const phone = normalizePhone(checkout.contactPhone);
  if (!phone) throw new AppError("Enter a valid phone number, for example 0911 234 567", 400, "invalid_phone");
  const settings = normalizeSettings(shop.settings);
  if (checkout.fulfillment === "delivery" && !settings.delivery.deliveryEnabled) {
    throw new AppError("This shop offers pickup only");
  }
  if (checkout.fulfillment === "pickup" && !settings.delivery.pickupEnabled) {
    throw new AppError("This shop offers delivery only");
  }
  if (checkout.fulfillment === "delivery" && !checkout.address?.trim()) {
    throw new AppError("Enter a delivery address", 400, "address_required");
  }

  const order = await db.transaction(async (tx) => {
    const cart = await tx.query.carts.findFirst({
      where: and(eq(carts.shopId, shop.id), eq(carts.ownerKey, input.ownerKey)),
    });
    if (!cart) throw new AppError("Your cart is empty", 400, "empty_cart");
    const rows = await tx
      .select({ line: cartLines, variant: productVariants, product: products })
      .from(cartLines)
      .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(cartLines.cartId, cart.id))
      .orderBy(asc(cartLines.addedAt));
    if (!rows.length) throw new AppError("Your cart is empty", 400, "empty_cart");

    // Abuse guard: blocked buyers and order bursts.
    const [customerRow] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.shopId, shop.id), eq(customers.phone, phone)));
    if (customerRow?.blocked) {
      throw new AppError("This shop can't take orders from this number. Please contact the seller.", 403, "blocked");
    }
    const hourAgo = new Date(Date.now() - 3600_000);
    const recent = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.shopId, shop.id),
          gte(orders.placedAt, hourAgo),
          input.buyerUserId
            ? or(eq(orders.contactPhone, phone), eq(orders.buyerUserId, input.buyerUserId))!
            : eq(orders.contactPhone, phone),
        ),
      );
    if (Number(recent[0]?.n ?? 0) >= MAX_ORDERS_PER_HOUR_PER_BUYER) {
      throw new AppError("Too many orders in a short time. Please try again later.", 429, "rate_limited");
    }

    let subtotal = 0n;
    let currency = shop.currency;
    for (const { line, variant, product } of rows) {
      if (product.status !== "published") throw new AppError(`"${product.title}" is no longer available`, 409, "unavailable");
      if (variant.priceMinor === null) throw new AppError(`"${product.title}" has no price yet`, 409, "no_price");
      subtotal += variant.priceMinor * BigInt(line.quantity);
      currency = variant.currency;
      if (variant.trackInventory) {
        // Conditional decrement: two buyers can never take the last item.
        const reserved = await tx
          .update(productVariants)
          .set({ inventoryQty: sql`${productVariants.inventoryQty} - ${line.quantity}`, updatedAt: new Date() })
          .where(and(eq(productVariants.id, variant.id), gte(productVariants.inventoryQty, line.quantity)))
          .returning({ id: productVariants.id });
        if (!reserved.length) {
          throw new AppError(`"${product.title}" just sold out`, 409, "sold_out");
        }
      }
    }

    const deliveryFee =
      checkout.fulfillment === "delivery" ? BigInt(settings.delivery.deliveryFeeMinor || "0") : 0n;
    const total = subtotal + deliveryFee;

    const [{ number }] = await tx
      .update(shops)
      .set({ nextOrderNumber: sql`${shops.nextOrderNumber} + 1` })
      .where(eq(shops.id, shop.id))
      .returning({ number: sql<number>`${shops.nextOrderNumber} - 1` });

    const [customer] = await tx
      .insert(customers)
      .values({
        shopId: shop.id,
        phone,
        name: checkout.contactName,
        userId: input.buyerUserId,
        orderCount: 1,
        lastOrderAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [customers.shopId, customers.phone],
        set: {
          name: checkout.contactName,
          orderCount: sql`${customers.orderCount} + 1`,
          lastOrderAt: new Date(),
          updatedAt: new Date(),
          ...(input.buyerUserId ? { userId: input.buyerUserId } : {}),
        },
      })
      .returning();

    const sourceCode = rows.find((r) => r.line.sourceCode)?.line.sourceCode ?? null;
    const [created] = await tx
      .insert(orders)
      .values({
        shopId: shop.id,
        number: Number(number),
        accessToken: shortCode(24),
        customerId: customer.id,
        buyerUserId: input.buyerUserId,
        paymentMethod: "on_delivery",
        fulfillment: checkout.fulfillment,
        contactName: checkout.contactName,
        contactPhone: phone,
        address: checkout.fulfillment === "delivery" ? (checkout.address ?? null) : null,
        notes: checkout.notes ?? null,
        subtotalMinor: subtotal,
        deliveryFeeMinor: deliveryFee,
        totalMinor: total,
        currency,
        sourceCode,
      })
      .returning();

    for (const { line, variant, product } of rows) {
      const cover = await tx.query.productImages.findFirst({
        where: eq(productImages.productId, product.id),
        orderBy: [asc(productImages.position)],
      });
      await tx.insert(orderLines).values({
        orderId: created.id,
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantTitle: variant.title === "Default" ? null : variant.title,
        imageKey: cover?.status === "ready" ? cover.storageKey : null,
        unitPriceMinor: variant.priceMinor!,
        quantity: line.quantity,
      });
    }
    await tx.insert(payments).values({
      orderId: created.id,
      shopId: shop.id,
      method: "on_delivery",
      provider: "on_delivery",
      amountMinor: total,
      currency,
    });
    await tx.delete(cartLines).where(eq(cartLines.cartId, cart.id));

    for (const { product, line } of rows) {
      await trackEvent(
        {
          shopId: shop.id,
          type: "order_placed",
          productId: product.id,
          orderId: created.id,
          sourceCode: line.sourceCode,
          actorUserId: input.buyerUserId,
        },
        tx,
      );
    }
    return created;
  });

  const lines = await db.select({ productId: orderLines.productId }).from(orderLines).where(eq(orderLines.orderId, order.id));
  await scheduleButtonSyncForProducts(
    shop.id,
    lines.map((l) => l.productId).filter((p): p is string => Boolean(p)),
  );
  await enqueue("notify", { kind: "order_placed", orderId: order.id }, { name: `order_placed:${order.id}` });
  return order;
}

// ── state machine ───────────────────────────────────────────────────────────
export type OrderAction = "confirm" | "ship" | "deliver" | "complete" | "cancel" | "mark_paid";

const FROM: Record<Exclude<OrderAction, "mark_paid">, OrderStatus[]> = {
  confirm: ["placed"],
  ship: ["confirmed"],
  deliver: ["placed", "confirmed", "shipped"],
  complete: ["delivered"],
  cancel: ["placed", "confirmed", "shipped"],
};

const TO: Record<Exclude<OrderAction, "mark_paid">, OrderStatus> = {
  confirm: "confirmed",
  ship: "shipped",
  deliver: "delivered",
  complete: "completed",
  cancel: "cancelled",
};

export function canTransition(status: OrderStatus, action: OrderAction, paymentStatus: Order["paymentStatus"]) {
  if (action === "mark_paid") return paymentStatus === "pending" && status !== "cancelled";
  return FROM[action].includes(status);
}

async function restock(tx: Tx, orderId: string) {
  const lines = await tx
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orderId, orderId), eq(orderLines.restocked, false)));
  for (const l of lines) {
    if (!l.variantId) continue;
    await tx
      .update(productVariants)
      .set({ inventoryQty: sql`${productVariants.inventoryQty} + ${l.quantity}`, updatedAt: new Date() })
      .where(and(eq(productVariants.id, l.variantId), eq(productVariants.trackInventory, true)));
    await tx.update(orderLines).set({ restocked: true }).where(eq(orderLines.id, l.id));
  }
  return lines.map((l) => l.productId).filter((p): p is string => Boolean(p));
}

/**
 * Apply one action. The UPDATE's WHERE re-checks the source state, so two
 * people pressing buttons at once can never double-apply a transition.
 */
export async function applyOrderAction(input: {
  shopId: string;
  orderId: string;
  action: OrderAction;
  actorUserId: string | null;
  reason?: string | null;
  notifyBuyer?: boolean;
}): Promise<Order> {
  const { action } = input;
  const touched: string[] = [];
  const order = await db.transaction(async (tx) => {
    const current = await tx.query.orders.findFirst({
      where: and(eq(orders.id, input.orderId), eq(orders.shopId, input.shopId)),
    });
    if (!current) throw notFound("Order not found");
    if (!canTransition(current.status, action, current.paymentStatus)) {
      throw new AppError(`Can't ${action.replace("_", " ")} an order that is ${current.status}`, 409, "invalid_transition");
    }
    const now = new Date();

    if (action === "mark_paid") {
      await tx
        .update(payments)
        .set({ status: "paid", paidAt: now, updatedAt: now })
        .where(and(eq(payments.orderId, current.id), eq(payments.status, "pending")));
      const nextStatus: OrderStatus = current.status === "delivered" ? "completed" : current.status;
      const [u] = await tx
        .update(orders)
        .set({
          paymentStatus: "paid",
          status: nextStatus,
          ...(nextStatus === "completed" ? { completedAt: now } : {}),
          updatedAt: now,
        })
        .where(and(eq(orders.id, current.id), eq(orders.paymentStatus, "pending")))
        .returning();
      if (!u) throw new AppError("Order changed, refresh and try again", 409);
      await tx
        .update(customers)
        .set({ totalSpentMinor: sql`${customers.totalSpentMinor} + ${current.totalMinor}`, updatedAt: now })
        .where(eq(customers.id, current.customerId));
      return u;
    }

    const to = TO[action];
    const stamp: Partial<typeof orders.$inferInsert> =
      to === "confirmed"
        ? { confirmedAt: now }
        : to === "shipped"
          ? { shippedAt: now }
          : to === "delivered"
            ? { deliveredAt: now }
            : to === "completed"
              ? { completedAt: now }
              : { cancelledAt: now, cancelReason: input.reason ?? null };
    let finalStatus: OrderStatus = to;
    if (to === "delivered" && current.paymentStatus === "paid") {
      finalStatus = "completed";
      stamp.completedAt = now;
    }
    // Completing a pay-on-delivery order means the cash was collected.
    const settlesCash = to === "completed" && current.paymentMethod === "on_delivery" && current.paymentStatus === "pending";
    const [updated] = await tx
      .update(orders)
      .set({
        status: finalStatus,
        ...stamp,
        ...(to === "cancelled" ? { paymentStatus: "voided" as const } : {}),
        ...(settlesCash ? { paymentStatus: "paid" as const } : {}),
        updatedAt: now,
      })
      .where(and(eq(orders.id, current.id), inArray(orders.status, FROM[action])))
      .returning();
    if (!updated) throw new AppError("Order changed, refresh and try again", 409);
    if (settlesCash) {
      await tx
        .update(payments)
        .set({ status: "paid", paidAt: now, updatedAt: now })
        .where(and(eq(payments.orderId, current.id), eq(payments.status, "pending")));
      await tx
        .update(customers)
        .set({ totalSpentMinor: sql`${customers.totalSpentMinor} + ${current.totalMinor}`, updatedAt: now })
        .where(eq(customers.id, current.customerId));
    }

    if (to === "cancelled") {
      await tx
        .update(payments)
        .set({ status: "voided", updatedAt: now })
        .where(and(eq(payments.orderId, current.id), eq(payments.status, "pending")));
      touched.push(...(await restock(tx, current.id)));
      await tx
        .update(customers)
        .set({ cancelCount: sql`${customers.cancelCount} + 1`, updatedAt: now })
        .where(eq(customers.id, current.customerId));
      await trackEvent({ shopId: current.shopId, type: "order_cancelled", orderId: current.id, actorUserId: input.actorUserId }, tx);
    }
    if (to === "delivered") {
      // One-offs that are now out of stock become "sold".
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, current.id));
      for (const l of lines) {
        if (!l.productId) continue;
        touched.push(l.productId);
        await tx
          .update(products)
          .set({ status: "sold", updatedAt: now })
          .where(
            and(
              eq(products.id, l.productId),
              eq(products.status, "published"),
              sql`not exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and (v.inventory_qty > 0 or v.track_inventory = false))`,
            ),
          );
      }
      await trackEvent({ shopId: current.shopId, type: "order_delivered", orderId: current.id, actorUserId: input.actorUserId }, tx);
    }
    await trackEvent(
      { shopId: current.shopId, type: "order_status_changed", orderId: current.id, actorUserId: input.actorUserId, data: { from: current.status, to: finalStatus } },
      tx,
    );
    return updated;
  });

  if (touched.length) await scheduleButtonSyncForProducts(order.shopId, [...new Set(touched)]);
  if (input.notifyBuyer !== false && action !== "mark_paid") {
    await enqueue(
      "notify",
      { kind: "order_status", orderId: order.id, status: order.status },
      { name: `order_status:${order.id}:${order.status}` },
    );
  }
  return order;
}

// ── reads ───────────────────────────────────────────────────────────────────
export type OrderTab = "to_confirm" | "to_ship" | "delivered" | "cancelled" | "all";

const TAB_STATUSES: Record<OrderTab, OrderStatus[] | null> = {
  to_confirm: ["placed"],
  to_ship: ["confirmed", "shipped"],
  delivered: ["delivered", "completed"],
  cancelled: ["cancelled"],
  all: null,
};

export async function listOrders(
  shopId: string,
  opts: { tab?: OrderTab; q?: string; cursor?: string | null; limit?: number; customerId?: string },
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where: SQL[] = [eq(orders.shopId, shopId)];
  const statuses = TAB_STATUSES[opts.tab ?? "all"];
  if (statuses) where.push(inArray(orders.status, statuses));
  if (opts.customerId) where.push(eq(orders.customerId, opts.customerId));
  if (opts.q?.trim()) {
    const q = opts.q.trim().replace(/^#/, "");
    const asNum = /^\d+$/.test(q) ? Number(q) : null;
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ...(asNum !== null ? [eq(orders.number, asNum)] : []),
        ilike(orders.contactName, like),
        ilike(orders.contactPhone, like),
      )!,
    );
  }
  if (opts.cursor) {
    const n = Number(opts.cursor);
    if (Number.isFinite(n)) where.push(lt(orders.number, n));
  }
  const rows = await db.query.orders.findMany({
    where: and(...where),
    with: { lines: true },
    orderBy: [desc(orders.number)],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page, nextCursor: hasMore ? String(page.at(-1)!.number) : null };
}

export async function countOrderTabs(shopId: string) {
  const rows = await db
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .groupBy(orders.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<OrderStatus, number>>;
  return {
    to_confirm: by.placed ?? 0,
    to_ship: (by.confirmed ?? 0) + (by.shipped ?? 0),
    delivered: (by.delivered ?? 0) + (by.completed ?? 0),
    cancelled: by.cancelled ?? 0,
  };
}

export async function getOrder(shopId: string, orderId: string) {
  return (
    (await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.shopId, shopId)),
      with: { lines: true, payments: true, customer: true },
    })) ?? null
  );
}

export async function getOrderForBuyer(shopId: string, number: number, token: string) {
  const row = await db.query.orders.findFirst({
    where: and(eq(orders.shopId, shopId), eq(orders.number, number)),
    with: { lines: true },
  });
  if (!row || row.accessToken !== token) return null;
  return row;
}

export async function listBuyerOrders(userId: string) {
  return db.query.orders.findMany({
    where: eq(orders.buyerUserId, userId),
    with: { lines: true, shop: true },
    orderBy: [desc(orders.placedAt)],
    limit: 50,
  });
}

type OrderWithLines = Order & { lines: (typeof orderLines.$inferSelect)[] };

export function serializeOrder(o: OrderWithLines) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    fulfillment: o.fulfillment,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    address: o.address,
    notes: o.notes,
    subtotalMinor: o.subtotalMinor.toString(),
    deliveryFeeMinor: o.deliveryFeeMinor.toString(),
    totalMinor: o.totalMinor.toString(),
    currency: o.currency,
    cancelReason: o.cancelReason,
    itemCount: o.lines.reduce((a, l) => a + l.quantity, 0),
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      title: l.title,
      variantTitle: l.variantTitle,
      image: l.imageKey ? imageUrl(l.imageKey, 320) : null,
      unitPriceMinor: l.unitPriceMinor.toString(),
      quantity: l.quantity,
    })),
    placedAt: o.placedAt.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    customerId: o.customerId,
  };
}

export type SerializedOrder = ReturnType<typeof serializeOrder>;

/** Sweeper: remind sellers about unconfirmed orders; auto-cancel stale ones. */
export async function processStaleOrders() {
  const now = Date.now();
  const stale = await db
    .select({ id: orders.id, shopId: orders.shopId, placedAt: orders.placedAt, remindersSent: orders.remindersSent })
    .from(orders)
    .where(and(eq(orders.status, "placed"), lt(orders.placedAt, new Date(now - 2 * 3600_000))))
    .limit(200);
  let reminded = 0;
  let cancelled = 0;
  for (const o of stale) {
    const ageH = (now - o.placedAt.getTime()) / 3600_000;
    if (ageH >= 72) {
      try {
        await applyOrderAction({
          shopId: o.shopId,
          orderId: o.id,
          action: "cancel",
          actorUserId: null,
          reason: "Not confirmed by the seller within 72 hours",
        });
        cancelled += 1;
      } catch {
        // Confirmed in the meantime.
      }
      continue;
    }
    const due = ageH >= 24 ? 2 : 1;
    if (o.remindersSent < due) {
      const claimed = await db
        .update(orders)
        .set({ remindersSent: due })
        .where(and(eq(orders.id, o.id), lt(orders.remindersSent, due)))
        .returning({ id: orders.id });
      if (claimed.length) {
        await enqueue("notify", { kind: "order_reminder", orderId: o.id }, { name: `order_reminder:${o.id}:${due}` });
        reminded += 1;
      }
    }
  }
  return { reminded, cancelled };
}
