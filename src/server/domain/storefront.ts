import "server-only";

import { and, asc, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import {
  collectionProducts,
  productImages,
  productVariants,
  products,
  shopDomains,
  shops,
  type Shop,
} from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { memberRole } from "@/server/domain/shops";
import { serializeProduct, type ProductBundle } from "@/server/domain/products";

export const HOST_PREFIX = "__host__";

/**
 * Storefront routes receive either a shop handle or, for custom domains, the
 * host the proxy rewrote to `__host__<hostname>`. Hidden shops are visible
 * only to their own members.
 */
export async function resolveStorefrontShop(param: string): Promise<Shop | null> {
  const value = decodeURIComponent(param).toLowerCase();
  let shop: Shop | undefined;
  if (value.startsWith(HOST_PREFIX)) {
    const host = value.slice(HOST_PREFIX.length);
    const domain = await db.query.shopDomains.findFirst({
      where: and(eq(shopDomains.hostname, host), eq(shopDomains.status, "active")),
      with: { shop: true },
    });
    shop = domain?.shop;
  } else {
    shop = await db.query.shops.findFirst({ where: eq(shops.handle, value) });
  }
  if (!shop) return null;
  if (shop.status === "hidden") {
    const session = await getSession();
    if (!session || !(await memberRole(shop.id, session.userId))) return null;
  }
  return shop;
}

export type StorefrontFilters = {
  q?: string;
  category?: string;
  collectionId?: string;
  cursor?: string | null;
  limit?: number;
};

function encode(p: { publishedAt: Date | null; id: string }) {
  return Buffer.from(`${(p.publishedAt ?? new Date(0)).toISOString()}|${p.id}`).toString("base64url");
}
function decode(c: string | null | undefined) {
  if (!c) return null;
  const [iso, id] = Buffer.from(c, "base64url").toString().split("|");
  const at = new Date(iso);
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null;
}

/** Published and sold products, newest first, keyset-paginated. */
export async function listStorefrontProducts(shopId: string, f: StorefrontFilters = {}) {
  const limit = Math.min(Math.max(f.limit ?? 24, 1), 60);
  const where: SQL[] = [eq(products.shopId, shopId), inArray(products.status, ["published", "sold"])];
  if (f.category) where.push(eq(products.category, f.category));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(products.title, like), ilike(products.brand, like), ilike(products.description, like))!);
  }
  if (f.collectionId) {
    where.push(
      sql`exists (select 1 from ${collectionProducts} cp where cp.product_id = ${products.id} and cp.collection_id = ${f.collectionId})`,
    );
  }
  const cur = decode(f.cursor);
  if (cur) {
    where.push(
      or(
        lt(products.publishedAt, cur.at),
        and(eq(products.publishedAt, cur.at), lt(products.id, cur.id)),
      )!,
    );
  }
  const rows = await db.query.products.findMany({
    where: and(...where),
    with: {
      variants: { orderBy: [asc(productVariants.position)] },
      images: { orderBy: [asc(productImages.position)], limit: 1 },
    },
    orderBy: [sql`${products.status} = 'sold'`, desc(products.publishedAt), desc(products.id)],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((p) => serializeProduct(p as ProductBundle)),
    nextCursor: hasMore && page.at(-1) ? encode(page.at(-1)!) : null,
  };
}

export async function storefrontCategories(shopId: string) {
  const rows = await db
    .select({ category: products.category, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.shopId, shopId), eq(products.status, "published"), sql`${products.category} is not null`))
    .groupBy(products.category)
    .orderBy(desc(sql`count(*)`))
    .limit(12);
  return rows.map((r) => ({ name: r.category!, count: Number(r.n) }));
}

export async function relatedProducts(shopId: string, excludeId: string, category: string | null) {
  const rows = await db.query.products.findMany({
    where: and(
      eq(products.shopId, shopId),
      eq(products.status, "published"),
      sql`${products.id} <> ${excludeId}`,
      ...(category ? [eq(products.category, category)] : []),
    ),
    with: {
      variants: { orderBy: [asc(productVariants.position)] },
      images: { orderBy: [asc(productImages.position)], limit: 1 },
    },
    orderBy: [desc(products.publishedAt)],
    limit: 8,
  });
  return rows.map((p) => serializeProduct(p as ProductBundle));
}
