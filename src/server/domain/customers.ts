import "server-only";

import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { customers, type Customer } from "@/server/db/schema";
import { notFound } from "@/server/http";

export async function listCustomers(
  shopId: string,
  opts: { q?: string; cursor?: string | null; limit?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where: SQL[] = [eq(customers.shopId, shopId)];
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(customers.name, like), ilike(customers.phone, like))!);
  }
  if (opts.cursor) {
    const at = new Date(opts.cursor);
    if (!Number.isNaN(at.getTime())) where.push(lt(customers.lastOrderAt, at));
  }
  const rows = await db
    .select()
    .from(customers)
    .where(and(...where))
    .orderBy(desc(customers.lastOrderAt), desc(customers.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return { items: page, nextCursor: hasMore && last?.lastOrderAt ? last.lastOrderAt.toISOString() : null };
}

export async function getCustomer(shopId: string, id: string) {
  return (
    (await db.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.shopId, shopId)) })) ?? null
  );
}

export const customerPatchSchema = z
  .object({ notes: z.string().trim().max(2000).nullable(), blocked: z.boolean() })
  .partial();

export async function updateCustomer(shopId: string, id: string, patch: z.infer<typeof customerPatchSchema>) {
  const [row] = await db
    .update(customers)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .returning();
  if (!row) throw notFound("Customer not found");
  return row;
}

export function serializeCustomer(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    notes: c.notes,
    orderCount: c.orderCount,
    cancelCount: c.cancelCount,
    totalSpentMinor: c.totalSpentMinor.toString(),
    lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
    blocked: c.blocked,
    flagged: c.cancelCount >= 3 && c.cancelCount >= c.orderCount / 2,
    createdAt: c.createdAt.toISOString(),
  };
}
