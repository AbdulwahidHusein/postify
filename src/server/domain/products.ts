import "server-only";

import { and, asc, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import {
  collectionProducts,
  productImages,
  productSources,
  productVariants,
  products,
  type Product,
  type ProductImage,
  type ProductSource,
  type ProductStatus,
  type ProductVariant,
  type TelegramPhotoSize,
  type Shop,
} from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { shortCode, slugify } from "@/server/ids";
import { imageUrl, type ImageWidth } from "@/server/services/storage";
import { toMinor } from "@/lib/money";

export type ProductBundle = Product & {
  variants: ProductVariant[];
  images: ProductImage[];
  sources?: ProductSource[];
};

const withRelations = {
  variants: { orderBy: [asc(productVariants.position)] as ReturnType<typeof asc>[] },
  images: { orderBy: [asc(productImages.position)] as ReturnType<typeof asc>[] },
};

// ── creation ────────────────────────────────────────────────────────────────
export type NewProductInput = {
  shopId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  location?: string | null;
  attributes?: Record<string, string>;
  tags?: string[];
  isNegotiable?: boolean;
  status: ProductStatus;
  aiConfidence?: number | null;
  rawCaption?: string | null;
  needsPrice?: boolean;
  slugHint?: string | null;
  variant: {
    priceMinor: bigint | null;
    compareAtMinor?: bigint | null;
    currency: string;
    sku?: string | null;
    trackInventory?: boolean;
    inventoryQty?: number;
  };
  images?: { telegramFileId?: string | null; telegramSizes?: TelegramPhotoSize[] | null; originalKey?: string | null }[];
};

function slugCandidate(title: string, hint?: string | null) {
  const stem = slugify(hint || title) || "item";
  return `${stem}-${shortCode(5).toLowerCase()}`;
}

export async function insertProduct(tx: DbOrTx, input: NewProductInput): Promise<ProductBundle> {
  const now = new Date();
  const [product] = await tx
    .insert(products)
    .values({
      shopId: input.shopId,
      code: shortCode(10),
      slug: slugCandidate(input.title, input.slugHint),
      title: input.title.trim().slice(0, 120) || "Untitled",
      description: input.description ?? null,
      category: input.category ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      condition: input.condition ?? null,
      location: input.location ?? null,
      attributes: input.attributes ?? {},
      tags: input.tags ?? [],
      isNegotiable: input.isNegotiable ?? false,
      status: input.status,
      aiConfidence: input.aiConfidence != null ? input.aiConfidence.toFixed(3) : null,
      rawCaption: input.rawCaption ?? null,
      needsPrice: input.needsPrice ?? false,
      publishedAt: input.status === "published" ? now : null,
    })
    .returning();

  const [variant] = await tx
    .insert(productVariants)
    .values({
      productId: product.id,
      shopId: input.shopId,
      priceMinor: input.variant.priceMinor,
      compareAtMinor: input.variant.compareAtMinor ?? null,
      currency: input.variant.currency,
      sku: input.variant.sku ?? null,
      trackInventory: input.variant.trackInventory ?? true,
      inventoryQty: input.variant.inventoryQty ?? 1,
    })
    .returning();

  const images = input.images?.length
    ? await tx
        .insert(productImages)
        .values(
          input.images.map((img, i) => ({
            productId: product.id,
            shopId: input.shopId,
            telegramFileId: img.telegramFileId ?? null,
            telegramSizes: img.telegramSizes ?? null,
            originalKey: img.originalKey ?? null,
            position: i,
          })),
        )
        .returning()
    : [];

  return { ...product, variants: [variant], images };
}

// ── reads ───────────────────────────────────────────────────────────────────
export async function getProductBundle(
  shopId: string,
  productId: string,
  tx: DbOrTx = db,
): Promise<ProductBundle | null> {
  const row = await tx.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.shopId, shopId)),
    with: { ...withRelations, sources: true },
  });
  return row ?? null;
}

export async function getProductByCode(code: string) {
  return (
    (await db.query.products.findFirst({
      where: eq(products.code, code),
      with: { ...withRelations, shop: true },
    })) ?? null
  );
}

export async function getStorefrontProduct(shopId: string, slug: string) {
  const row = await db.query.products.findFirst({
    where: and(
      eq(products.shopId, shopId),
      eq(products.slug, slug),
      inArray(products.status, ["published", "sold"]),
    ),
    with: { ...withRelations, sources: { with: { channel: true } } },
  });
  return row ?? null;
}

export type ProductListFilters = {
  q?: string;
  status?: ProductStatus | "all" | "attention";
  category?: string;
  channelId?: string;
  collectionId?: string;
  cursor?: string | null;
  limit?: number;
  sort?: "updated" | "price_asc" | "price_desc";
};

/** Cursor = base64("<iso updatedAt>|<id>") for stable keyset pagination. */
function encodeCursor(p: { updatedAt: Date; id: string }) {
  return Buffer.from(`${p.updatedAt.toISOString()}|${p.id}`).toString("base64url");
}

function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export async function listProducts(shopId: string, filters: ProductListFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const where: SQL[] = [eq(products.shopId, shopId)];
  if (filters.status === "attention") {
    where.push(or(eq(products.status, "draft"), eq(products.needsPrice, true))!);
  } else if (filters.status && filters.status !== "all") {
    where.push(eq(products.status, filters.status));
  } else {
    where.push(sql`${products.status} <> 'archived'`);
  }
  if (filters.category) where.push(eq(products.category, filters.category));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(products.title, q), ilike(products.brand, q), ilike(products.model, q))!);
  }
  if (filters.channelId) {
    where.push(
      sql`exists (select 1 from ${productSources} ps where ps.product_id = ${products.id} and ps.channel_id = ${filters.channelId})`,
    );
  }
  if (filters.collectionId) {
    where.push(
      sql`exists (select 1 from ${collectionProducts} cp where cp.product_id = ${products.id} and cp.collection_id = ${filters.collectionId})`,
    );
  }
  const cursor = decodeCursor(filters.cursor);
  if (cursor) {
    where.push(
      or(
        lt(products.updatedAt, cursor.at),
        and(eq(products.updatedAt, cursor.at), lt(products.id, cursor.id)),
      )!,
    );
  }

  const rows = await db.query.products.findMany({
    where: and(...where),
    with: withRelations,
    orderBy: [desc(products.updatedAt), desc(products.id)],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return { items: page, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

export async function countByStatus(shopId: string) {
  const rows = await db
    .select({ status: products.status, n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.shopId, shopId))
    .groupBy(products.status);
  const out: Record<ProductStatus, number> = { draft: 0, published: 0, sold: 0, archived: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

// ── updates ─────────────────────────────────────────────────────────────────
const money = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === "") return null;
    const m = toMinor(v);
    if (m === null || m < 0n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    return m;
  });

export const productPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(6000).nullable(),
    category: z.string().trim().max(160).nullable(),
    brand: z.string().trim().max(80).nullable(),
    model: z.string().trim().max(120).nullable(),
    condition: z.string().trim().max(60).nullable(),
    location: z.string().trim().max(120).nullable(),
    attributes: z.record(z.string().max(80), z.string().max(200)),
    tags: z.array(z.string().trim().min(1).max(40)).max(12),
    isNegotiable: z.boolean(),
    status: z.enum(["draft", "published", "sold", "archived"]),
    price: money,
    compareAtPrice: money,
    sku: z.string().trim().max(64).nullable(),
    trackInventory: z.boolean(),
    inventoryQty: z.number().int().min(0).max(1_000_000),
  })
  .partial();

export type ProductPatch = z.infer<typeof productPatchSchema>;

/** Fields whose change alters what the Order button shows. */
export function affectsButtons(patch: ProductPatch) {
  return (
    patch.price !== undefined ||
    patch.status !== undefined ||
    patch.inventoryQty !== undefined ||
    patch.title !== undefined
  );
}

export async function updateProduct(
  shop: Shop,
  productId: string,
  patch: ProductPatch,
): Promise<ProductBundle> {
  return db.transaction(async (tx) => {
    const current = await getProductBundle(shop.id, productId, tx);
    if (!current) throw notFound("Product not found");
    const variant = current.variants[0];
    const now = new Date();

    const nextStatus = patch.status ?? current.status;
    const productSet: Partial<typeof products.$inferInsert> = { updatedAt: now };
    for (const key of [
      "title", "description", "category", "brand", "model", "condition", "location",
      "attributes", "tags", "isNegotiable",
    ] as const) {
      if (patch[key] !== undefined) (productSet as Record<string, unknown>)[key] = patch[key];
    }
    if (patch.status !== undefined) {
      productSet.status = patch.status;
      if (patch.status === "published" && !current.publishedAt) productSet.publishedAt = now;
    }
    if (patch.price !== undefined) productSet.needsPrice = patch.price === null && nextStatus === "draft";

    await tx.update(products).set(productSet).where(eq(products.id, current.id));

    const variantSet: Partial<typeof productVariants.$inferInsert> = {};
    if (patch.price !== undefined) variantSet.priceMinor = patch.price;
    if (patch.compareAtPrice !== undefined) variantSet.compareAtMinor = patch.compareAtPrice;
    if (patch.sku !== undefined) variantSet.sku = patch.sku;
    if (patch.trackInventory !== undefined) variantSet.trackInventory = patch.trackInventory;
    if (patch.inventoryQty !== undefined) variantSet.inventoryQty = patch.inventoryQty;
    // Marking sold empties stock; republishing a sold one-off restocks it.
    if (patch.status === "sold") variantSet.inventoryQty = 0;
    if (
      patch.status === "published" &&
      current.status === "sold" &&
      patch.inventoryQty === undefined &&
      variant?.trackInventory &&
      variant.inventoryQty === 0
    ) {
      variantSet.inventoryQty = 1;
    }
    if (variant && Object.keys(variantSet).length) {
      await tx
        .update(productVariants)
        .set({ ...variantSet, updatedAt: now })
        .where(eq(productVariants.id, variant.id));
    }

    const fresh = await getProductBundle(shop.id, current.id, tx);
    if (!fresh) throw notFound("Product not found");
    return fresh;
  });
}

export type BulkAction = "publish" | "draft" | "sold" | "archive" | "delete";

export async function bulkUpdateStatus(shop: Shop, ids: string[], action: BulkAction) {
  if (!ids.length) return 0;
  if (ids.length > 200) throw new AppError("Select at most 200 products at a time");
  const scoped = and(eq(products.shopId, shop.id), inArray(products.id, ids));
  if (action === "delete") {
    // Products still posted in Telegram are archived instead, so their post
    // buttons can be removed; the rest are deleted outright.
    const posted = new Set(
      (
        await db
          .selectDistinct({ id: productSources.productId })
          .from(productSources)
          .where(and(eq(productSources.shopId, shop.id), inArray(productSources.productId, ids)))
      ).map((r) => r.id),
    );
    const toDelete = ids.filter((id) => !posted.has(id));
    const toArchive = ids.filter((id) => posted.has(id));
    let n = 0;
    if (toDelete.length) {
      n += (
        await db
          .delete(products)
          .where(and(eq(products.shopId, shop.id), inArray(products.id, toDelete)))
          .returning({ id: products.id })
      ).length;
    }
    if (toArchive.length) {
      n += (
        await db
          .update(products)
          .set({ status: "archived", updatedAt: new Date() })
          .where(and(eq(products.shopId, shop.id), inArray(products.id, toArchive)))
          .returning({ id: products.id })
      ).length;
    }
    return n;
  }
  const status: ProductStatus =
    action === "publish" ? "published" : action === "draft" ? "draft" : action === "sold" ? "sold" : "archived";
  const now = new Date();
  const updated = await db
    .update(products)
    .set({
      status,
      updatedAt: now,
      ...(status === "published" ? { publishedAt: sql`coalesce(${products.publishedAt}, now())` } : {}),
    })
    .where(scoped)
    .returning({ id: products.id });
  if (status === "sold") {
    await db
      .update(productVariants)
      .set({ inventoryQty: 0, updatedAt: now })
      .where(and(eq(productVariants.shopId, shop.id), inArray(productVariants.productId, ids)));
  }
  return updated.length;
}

export async function sourcesForProducts(shopId: string, productIds: string[]) {
  if (!productIds.length) return [];
  return db
    .select({ id: productSources.id, chatId: productSources.chatId })
    .from(productSources)
    .where(and(eq(productSources.shopId, shopId), inArray(productSources.productId, productIds)));
}

// ── serialization ───────────────────────────────────────────────────────────
export function imageSrc(img: ProductImage, width: ImageWidth = 800): string | null {
  return img.status === "ready" && img.storageKey ? imageUrl(img.storageKey, width) : null;
}

export function serializeImage(img: ProductImage) {
  return {
    id: img.id,
    status: img.status,
    width: img.width,
    height: img.height,
    color: img.dominantColor,
    alt: img.alt,
    thumb: imageSrc(img, 320),
    src: imageSrc(img, 800),
    large: imageSrc(img, 1600),
  };
}

export function serializeVariant(v: ProductVariant) {
  return {
    id: v.id,
    title: v.title,
    options: v.options,
    priceMinor: v.priceMinor?.toString() ?? null,
    compareAtMinor: v.compareAtMinor?.toString() ?? null,
    currency: v.currency,
    sku: v.sku,
    trackInventory: v.trackInventory,
    inventoryQty: v.inventoryQty,
    available: !v.trackInventory || v.inventoryQty > 0,
  };
}

export function serializeProduct(p: ProductBundle) {
  const variants = p.variants.map(serializeVariant);
  const primary = variants[0] ?? null;
  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    brand: p.brand,
    model: p.model,
    condition: p.condition,
    location: p.location,
    attributes: p.attributes,
    tags: p.tags,
    isNegotiable: p.isNegotiable,
    status: p.status,
    needsPrice: p.needsPrice,
    aiConfidence: p.aiConfidence !== null ? Number(p.aiConfidence) : null,
    rawCaption: p.rawCaption,
    priceMinor: primary?.priceMinor ?? null,
    compareAtMinor: primary?.compareAtMinor ?? null,
    currency: primary?.currency ?? "ETB",
    inventoryQty: primary?.inventoryQty ?? 0,
    trackInventory: primary?.trackInventory ?? true,
    available: p.status === "published" && Boolean(primary?.available),
    variants,
    images: p.images.map(serializeImage),
    fromTelegram: (p.sources?.length ?? 0) > 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
  };
}

export type SerializedProduct = ReturnType<typeof serializeProduct>;

// ── manual creation (dashboard) ─────────────────────────────────────────────
export const createProductSchema = productPatchSchema.extend({
  title: z.string().trim().min(1).max(120),
  imageKeys: z.array(z.string().max(300)).max(10).optional(),
});

export async function createManualProduct(shop: Shop, input: z.infer<typeof createProductSchema>) {
  const keys = input.imageKeys ?? [];
  const prefix = `originals/shops/${shop.id}/`;
  if (keys.some((k) => !k.startsWith(prefix))) throw new AppError("Invalid image upload");
  const status = input.status ?? "draft";
  if (status === "published" && (input.price === undefined || input.price === null)) {
    // Allowed: shows "Ask price" in Telegram and the storefront.
  }
  return db.transaction(async (tx) =>
    insertProduct(tx, {
      shopId: shop.id,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      condition: input.condition ?? null,
      location: input.location ?? null,
      attributes: input.attributes ?? {},
      tags: input.tags ?? [],
      isNegotiable: input.isNegotiable ?? false,
      status,
      variant: {
        priceMinor: input.price ?? null,
        compareAtMinor: input.compareAtPrice ?? null,
        currency: shop.currency,
        sku: input.sku ?? null,
        trackInventory: input.trackInventory ?? true,
        inventoryQty: input.inventoryQty ?? 1,
      },
      images: keys.map((originalKey) => ({ originalKey })),
    }),
  );
}

export async function addProductImage(shop: Shop, productId: string, originalKey: string) {
  if (!originalKey.startsWith(`originals/shops/${shop.id}/`)) throw new AppError("Invalid image upload");
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.shopId, shop.id)),
    with: { images: true },
  });
  if (!product) throw notFound("Product not found");
  if (product.images.length >= 10) throw new AppError("A product can have at most 10 images");
  const [img] = await db
    .insert(productImages)
    .values({ productId, shopId: shop.id, originalKey, position: product.images.length })
    .returning();
  return img;
}

export async function deleteProductImage(shopId: string, productId: string, imageId: string) {
  const del = await db
    .delete(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId), eq(productImages.shopId, shopId)))
    .returning();
  return del[0] ?? null;
}

export async function reorderImages(shopId: string, productId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx
        .update(productImages)
        .set({ position: i, updatedAt: new Date() })
        .where(and(eq(productImages.id, id), eq(productImages.productId, productId), eq(productImages.shopId, shopId)));
    }
  });
}
