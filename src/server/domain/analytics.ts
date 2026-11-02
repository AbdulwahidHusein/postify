import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { events, orders, productSources, products, shopDailyStats } from "@/server/db/schema";
import { log } from "@/server/log";

export type EventType =
  | "product_viewed"
  | "shop_viewed"
  | "inquiry_started"
  | "added_to_cart"
  | "order_placed"
  | "order_cancelled"
  | "order_delivered"
  | "listing_ingested"
  | "online_payment_interest"
  | "product_updated"
  | "order_status_changed";

/** Append-only event log. Never throws: analytics must not break a request. */
export async function trackEvent(
  e: {
    shopId: string;
    type: EventType;
    productId?: string | null;
    orderId?: string | null;
    sourceCode?: string | null;
    actorUserId?: string | null;
    data?: Record<string, unknown>;
  },
  tx: DbOrTx = db,
) {
  try {
    await tx.insert(events).values({
      shopId: e.shopId,
      type: e.type,
      productId: e.productId ?? null,
      orderId: e.orderId ?? null,
      sourceCode: e.sourceCode ?? null,
      actorUserId: e.actorUserId ?? null,
      data: e.data ?? {},
    });
  } catch (err) {
    log.warn("trackEvent failed", { type: e.type, err });
  }
}

/** Roll one day of events and orders into shop_daily_stats (idempotent). */
export async function rollupDay(day: string) {
  await db.execute(sql`
    insert into ${shopDailyStats} (shop_id, day, views, inquiries, orders, revenue_minor)
    select s.shop_id, ${day}::date,
      coalesce(sum(case when s.type in ('product_viewed','shop_viewed') then s.n end), 0)::int,
      coalesce(sum(case when s.type = 'inquiry_started' then s.n end), 0)::int,
      coalesce((select count(*) from ${orders} o where o.shop_id = s.shop_id and o.placed_at::date = ${day}::date), 0)::int,
      coalesce((select sum(o.total_minor) from ${orders} o where o.shop_id = s.shop_id and o.placed_at::date = ${day}::date and o.status <> 'cancelled'), 0)
    from (
      select shop_id, type, count(*) as n from ${events}
      where created_at >= ${day}::date and created_at < ${day}::date + interval '1 day'
      group by shop_id, type
    ) s
    group by s.shop_id
    on conflict (shop_id, day) do update set
      views = excluded.views, inquiries = excluded.inquiries,
      orders = excluded.orders, revenue_minor = excluded.revenue_minor
  `);
}

export async function shopAnalytics(shopId: string, days: 7 | 30 | 90) {
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  // Today is not rolled up yet: count it live and merge.
  const [stored, live, ordersLive] = await Promise.all([
    db
      .select()
      .from(shopDailyStats)
      .where(and(eq(shopDailyStats.shopId, shopId), gte(shopDailyStats.day, sinceDay))),
    db
      .select({
        type: events.type,
        n: sql<number>`count(*)::int`,
      })
      .from(events)
      .where(and(eq(events.shopId, shopId), gte(events.createdAt, sql`date_trunc('day', now())`)))
      .groupBy(events.type),
    db
      .select({
        n: sql<number>`count(*)::int`,
        revenue: sql<string>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalMinor} end), 0)::text`,
      })
      .from(orders)
      .where(and(eq(orders.shopId, shopId), gte(orders.placedAt, sql`date_trunc('day', now())`))),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const series = new Map<string, { views: number; inquiries: number; orders: number; revenueMinor: bigint }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.set(d, { views: 0, inquiries: 0, orders: 0, revenueMinor: 0n });
  }
  for (const r of stored) {
    if (r.day === today) continue;
    series.set(r.day, { views: r.views, inquiries: r.inquiries, orders: r.orders, revenueMinor: r.revenueMinor });
  }
  const liveViews = live
    .filter((r) => r.type === "product_viewed" || r.type === "shop_viewed")
    .reduce((a, r) => a + Number(r.n), 0);
  const liveInq = live.filter((r) => r.type === "inquiry_started").reduce((a, r) => a + Number(r.n), 0);
  series.set(today, {
    views: liveViews,
    inquiries: liveInq,
    orders: Number(ordersLive[0]?.n ?? 0),
    revenueMinor: BigInt(ordersLive[0]?.revenue ?? "0"),
  });

  const points = [...series.entries()].map(([day, v]) => ({ day, ...v }));
  const totals = points.reduce(
    (a, p) => ({
      views: a.views + p.views,
      inquiries: a.inquiries + p.inquiries,
      orders: a.orders + p.orders,
      revenueMinor: a.revenueMinor + p.revenueMinor,
    }),
    { views: 0, inquiries: 0, orders: 0, revenueMinor: 0n },
  );

  const [topProducts, topPosts] = await Promise.all([
    db
      .select({
        productId: events.productId,
        title: products.title,
        views: sql<number>`count(*) filter (where ${events.type} = 'product_viewed')::int`,
        orders: sql<number>`count(*) filter (where ${events.type} = 'order_placed')::int`,
      })
      .from(events)
      .innerJoin(products, eq(products.id, events.productId))
      .where(and(eq(events.shopId, shopId), gte(events.createdAt, since)))
      .groupBy(events.productId, products.title)
      .orderBy(desc(sql`count(*) filter (where ${events.type} = 'order_placed')`), desc(sql`count(*)`))
      .limit(10),
    db
      .select({
        sourceCode: events.sourceCode,
        productTitle: products.title,
        chatId: productSources.chatId,
        messageId: productSources.messageId,
        views: sql<number>`count(*) filter (where ${events.type} = 'product_viewed')::int`,
        orders: sql<number>`count(*) filter (where ${events.type} = 'order_placed')::int`,
      })
      .from(events)
      .innerJoin(productSources, eq(productSources.code, events.sourceCode))
      .innerJoin(products, eq(products.id, productSources.productId))
      .where(and(eq(events.shopId, shopId), gte(events.createdAt, since)))
      .groupBy(events.sourceCode, products.title, productSources.chatId, productSources.messageId)
      .orderBy(desc(sql`count(*) filter (where ${events.type} = 'order_placed')`), desc(sql`count(*)`))
      .limit(10),
  ]);

  return {
    days,
    points,
    totals: {
      ...totals,
      conversion: totals.views > 0 ? totals.orders / totals.views : 0,
    },
    topProducts,
    topPosts,
  };
}
