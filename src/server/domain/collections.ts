import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { collectionProducts, collections, products } from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { shortCode, slugify } from "@/server/ids";

export const collectionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function listCollections(shopId: string) {
  const rows = await db
    .select({
      c: collections,
      count: sql<number>`(select count(*)::int from ${collectionProducts} cp where cp.collection_id = ${collections.id})`,
    })
    .from(collections)
    .where(eq(collections.shopId, shopId))
    .orderBy(asc(collections.position), asc(collections.createdAt));
  return rows.map((r) => ({
    id: r.c.id,
    handle: r.c.handle,
    title: r.c.title,
    description: r.c.description,
    productCount: Number(r.count),
  }));
}

export async function createCollection(shopId: string, input: z.infer<typeof collectionSchema>) {
  const base = slugify(input.title) || "collection";
  const taken = await db.query.collections.findFirst({
    where: and(eq(collections.shopId, shopId), eq(collections.handle, base)),
  });
  const [row] = await db
    .insert(collections)
    .values({
      shopId,
      title: input.title,
      description: input.description ?? null,
      handle: taken ? `${base}-${shortCode(4).toLowerCase()}` : base,
    })
    .returning();
  return row;
}

export async function updateCollection(shopId: string, id: string, input: Partial<z.infer<typeof collectionSchema>>) {
  const [row] = await db
    .update(collections)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(collections.id, id), eq(collections.shopId, shopId)))
    .returning();
  if (!row) throw notFound("Collection not found");
  return row;
}

export async function deleteCollection(shopId: string, id: string) {
  await db.delete(collections).where(and(eq(collections.id, id), eq(collections.shopId, shopId)));
}

export async function addToCollection(shopId: string, collectionId: string, productIds: string[]) {
  const col = await db.query.collections.findFirst({
    where: and(eq(collections.id, collectionId), eq(collections.shopId, shopId)),
  });
  if (!col) throw notFound("Collection not found");
  if (!productIds.length) return 0;
  if (productIds.length > 200) throw new AppError("Too many products at once");
  const owned = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.shopId, shopId), inArray(products.id, productIds)));
  if (!owned.length) return 0;
  await db
    .insert(collectionProducts)
    .values(owned.map((p, i) => ({ collectionId, productId: p.id, position: i })))
    .onConflictDoNothing();
  return owned.length;
}

export async function removeFromCollection(shopId: string, collectionId: string, productIds: string[]) {
  const col = await db.query.collections.findFirst({
    where: and(eq(collections.id, collectionId), eq(collections.shopId, shopId)),
  });
  if (!col || !productIds.length) return 0;
  const del = await db
    .delete(collectionProducts)
    .where(and(eq(collectionProducts.collectionId, collectionId), inArray(collectionProducts.productId, productIds)))
    .returning();
  return del.length;
}

export async function collectionByHandle(shopId: string, handle: string) {
  return (
    (await db.query.collections.findFirst({
      where: and(eq(collections.shopId, shopId), eq(collections.handle, handle)),
    })) ?? null
  );
}
