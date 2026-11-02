import "server-only";

import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { channels, events, orders, productSources, products } from "@/server/db/schema";
import { countOrderTabs } from "@/server/domain/orders";
import { unreadForShop } from "@/server/domain/chat";

export async function shellBadges(shopId: string) {
  const [tabs, inbox, attention] = await Promise.all([
    countOrderTabs(shopId),
    unreadForShop(shopId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.shopId, shopId), or(eq(products.status, "draft"), eq(products.needsPrice, true)))),
  ]);
  return { orders: tabs.to_confirm, inbox, attention: Number(attention[0]?.n ?? 0) };
}

export async function homeSummary(shopId: string) {
  const startOfDay = sql`date_trunc('day', now())`;
  const [todayOrders, todayEvents, drafts, needsPrice, failing, chs, productCount, tabs, inbox] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        revenue: sql<string>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalMinor} end), 0)::text`,
      })
      .from(orders)
      .where(and(eq(orders.shopId, shopId), gte(orders.placedAt, startOfDay))),
    db
      .select({ type: events.type, n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.shopId, shopId), gte(events.createdAt, startOfDay), inArray(events.type, ["product_viewed", "shop_viewed", "inquiry_started"])))
      .groupBy(events.type),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.shopId, shopId), eq(products.status, "draft"), eq(products.needsPrice, false))),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.shopId, shopId), eq(products.needsPrice, true), eq(products.status, "draft"))),
    db.select({ n: sql<number>`count(*)::int` }).from(productSources).where(and(eq(productSources.shopId, shopId), eq(productSources.buttonStatus, "failed"))),
    db.select().from(channels).where(eq(channels.shopId, shopId)),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.shopId, shopId)),
    countOrderTabs(shopId),
    unreadForShop(shopId),
  ]);
  const views = todayEvents.filter((e) => e.type !== "inquiry_started").reduce((a, e) => a + Number(e.n), 0);
  const inquiries = todayEvents.filter((e) => e.type === "inquiry_started").reduce((a, e) => a + Number(e.n), 0);
  return {
    today: {
      orders: Number(todayOrders[0]?.n ?? 0),
      revenueMinor: todayOrders[0]?.revenue ?? "0",
      views,
      inquiries,
    },
    todo: {
      toConfirm: tabs.to_confirm,
      toShip: tabs.to_ship,
      unread: inbox,
      drafts: Number(drafts[0]?.n ?? 0),
      needsPrice: Number(needsPrice[0]?.n ?? 0),
      failingButtons: Number(failing[0]?.n ?? 0),
    },
    setup: {
      channels: chs.filter((c) => c.status === "connected").length,
      products: Number(productCount[0]?.n ?? 0),
      disconnected: chs.filter((c) => c.status === "disconnected").length,
    },
  };
}
