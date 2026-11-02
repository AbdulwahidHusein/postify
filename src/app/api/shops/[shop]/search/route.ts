import { and, desc, eq, ilike, or } from "drizzle-orm";
import { json } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { db } from "@/server/db";
import { customers, orders, products } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Command bar: top matches across products, orders and customers. */
export const GET = shopRoute("shop.view", async (request, { shop }) => {
  const q = (searchParams(request).get("q") ?? "").trim();
  if (q.length < 2) return json({ products: [], orders: [], customers: [] });
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  const [p, o, c] = await Promise.all([
    db.select({ id: products.id, title: products.title, status: products.status }).from(products)
      .where(and(eq(products.shopId, shop.id), ilike(products.title, like))).orderBy(desc(products.updatedAt)).limit(5),
    db.select({ id: orders.id, number: orders.number, name: orders.contactName, status: orders.status }).from(orders)
      .where(and(eq(orders.shopId, shop.id), or(...(num !== null ? [eq(orders.number, num)] : []), ilike(orders.contactName, like), ilike(orders.contactPhone, like))))
      .orderBy(desc(orders.number)).limit(5),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers)
      .where(and(eq(customers.shopId, shop.id), or(ilike(customers.name, like), ilike(customers.phone, like))))
      .limit(5),
  ]);
  return json({ products: p, orders: o, customers: c });
});
