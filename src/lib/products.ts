import "server-only";

import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  productImages,
  products,
  type Channel,
  type Product,
  type ProductImage,
  type Shop,
} from "@/db/schema";
import {
  extractListingFromCaption,
  formatListingTags,
} from "@/lib/llm/extract-listing";
import {
  ADMIN_PAGE_SIZE,
  buildPageMeta,
  normalizePagination,
  type PageMeta,
} from "@/lib/pagination";
import { normalizeShopSettings } from "@/lib/shops";
import { slugify, uniqueSlugHint } from "@/lib/slug";
import { deleteLocalProductImage } from "@/lib/storage";
import { telegramMessageUrl } from "@/lib/telegram-links";

export type IncomingPhoto = {
  fileId: string;
};

export type ProductStatus = "draft" | "published" | "sold" | "archived";

export type ProductWithImages = Product & { images: ProductImage[] };

export type ProductUpdateInput = {
  title?: string;
  description?: string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  currency?: string;
  category?: string | null;
  sku?: string | null;
  stockQuantity?: number | null;
  tags?: string | null;
  status?: ProductStatus;
};

function numOrNull(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || Number.isNaN(value)) return null;
  return String(value);
}

export type ChannelIngestResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "duplicate"; product: Product }
  | { outcome: "created"; product: Product };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

async function findExistingChannelProduct(input: {
  shop: Shop;
  chatId: bigint;
  messageId: number;
  mediaGroupId?: string | null;
}): Promise<Product | null> {
  if (input.mediaGroupId) {
    const byGroup = await db.query.products.findFirst({
      where: and(
        eq(products.shopId, input.shop.id),
        eq(products.sourceMediaGroupId, input.mediaGroupId),
      ),
    });
    if (byGroup) return byGroup;
  }
  return (
    (await db.query.products.findFirst({
      where: and(
        eq(products.shopId, input.shop.id),
        eq(products.sourceChatId, input.chatId),
        eq(products.sourceMessageId, input.messageId),
      ),
    })) ?? null
  );
}

export async function createProductFromChannelPost(input: {
  shop: Shop;
  channel: Channel;
  caption: string;
  messageId: number;
  chatId: bigint;
  mediaGroupId?: string | null;
  photos: IncomingPhoto[];
}): Promise<ChannelIngestResult> {
  const settings = normalizeShopSettings(input.shop.settings);
  const parsed = await extractListingFromCaption(input.caption, {
    defaultCurrency: settings.defaultCurrency || "ETB",
    hasMedia: input.photos.length > 0,
    preferredCategories: settings.sellCategories ?? [],
  });

  if (!parsed.isProduct) {
    return {
      outcome: "skipped",
      reason: "Skipped — doesn’t look like a product listing.",
    };
  }

  // Dedup (fast path): the partial unique indexes below make this the last
  // line of defense — a concurrent insert that slips through here will throw
  // a unique violation at insert time and be recovered below.
  const existing = await findExistingChannelProduct(input);
  if (existing) {
    return { outcome: "duplicate", product: existing };
  }

  // Respect the shop's auto-publish threshold: low-confidence parses become
  // drafts (seller confirms in the dashboard) rather than going live.
  const autoPublishMinConfidence = settings.autoPublishMinConfidence ?? 0.8;
  const status: ProductStatus =
    parsed.confidence >= autoPublishMinConfidence ? "published" : "draft";

  const baseSlug =
    slugify(parsed.slugHint || parsed.title).slice(0, 40) || "item";
  const slug = `${baseSlug}-${uniqueSlugHint(
    `${input.chatId}-${input.messageId}-${Date.now()}`,
  )}`;

  let product: Product | undefined;
  try {
    [product] = await db
      .insert(products)
      .values({
        shopId: input.shop.id,
        channelId: input.channel.id,
        slug,
        title: parsed.title,
        description: parsed.description || null,
        price: parsed.price !== null ? String(parsed.price) : null,
        compareAtPrice:
          parsed.compareAtPrice !== null ? String(parsed.compareAtPrice) : null,
        currency: parsed.currency ?? settings.defaultCurrency,
        category: parsed.category,
        sku: parsed.sku,
        tags: formatListingTags(parsed.tags),
        status,
        confidence: String(parsed.confidence),
        rawCaption: input.caption || null,
        sourceChatId: input.chatId,
        sourceMessageId: input.messageId,
        sourceMediaGroupId: input.mediaGroupId ?? null,
      })
      .returning();
  } catch (err) {
    // Concurrent insert won the race (album parts or a Telegram webhook
    // retry processed in parallel). Treat the winner as the product.
    if (!isUniqueViolation(err)) throw err;
    const raced = await findExistingChannelProduct(input);
    if (raced) return { outcome: "duplicate", product: raced };
    throw err;
  }
  if (!product) throw new Error("Product insert returned no row");

  if (input.photos.length) {
    await db.insert(productImages).values(
      input.photos.map((photo, index) => ({
        productId: product.id,
        telegramFileId: photo.fileId,
        sortOrder: index,
      })),
    );
  }

  if (parsed.source === "gemini") {
    console.info(
      `[ingest] gemini listing shop=${input.shop.slug} title=${JSON.stringify(parsed.title)} price=${parsed.price} confidence=${parsed.confidence}`,
    );
  }

  return { outcome: "created", product };
}

export async function getProductBySlug(slug: string) {
  return (
    (await db.query.products.findFirst({
      where: eq(products.slug, slug),
      with: {
        images: {
          orderBy: (img, { asc: orderAsc }) => [orderAsc(img.sortOrder)],
        },
        shop: true,
        channel: true,
      },
    })) ?? null
  );
}

export async function getProductById(id: string) {
  return (
    (await db.query.products.findFirst({
      where: eq(products.id, id),
      with: {
        images: {
          orderBy: (img, { asc: orderAsc }) => [orderAsc(img.sortOrder)],
        },
        shop: true,
        channel: true,
      },
    })) ?? null
  );
}

function productListWhere(
  shopId: string,
  opts?: {
    q?: string;
    status?: ProductStatus | "all";
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  },
) {
  const status = opts?.status ?? "all";
  const q = opts?.q?.trim();
  const category = opts?.category?.trim();
  const minPrice = opts?.minPrice;
  const maxPrice = opts?.maxPrice;

  const conditions = [eq(products.shopId, shopId)];
  if (status !== "all") {
    conditions.push(eq(products.status, status));
  }
  if (category) {
    conditions.push(ilike(products.category, `%${category}%`));
  }
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(products.title, pattern),
        ilike(products.description, pattern),
        ilike(products.category, pattern),
        ilike(products.sku, pattern),
        ilike(products.tags, pattern),
      )!,
    );
  }
  if (minPrice != null && Number.isFinite(minPrice)) {
    conditions.push(
      and(
        sql`${products.price} is not null`,
        sql`${products.price}::numeric >= ${minPrice}`,
      )!,
    );
  }
  if (maxPrice != null && Number.isFinite(maxPrice)) {
    conditions.push(
      and(
        sql`${products.price} is not null`,
        sql`${products.price}::numeric <= ${maxPrice}`,
      )!,
    );
  }
  return and(...conditions);
}

export type ProductListPage = {
  products: ProductWithImages[];
  pagination: PageMeta;
};

/** Paginated product list. Always returns a page (never the full table). */
export async function listProductsForShop(
  shopId: string,
  opts?: {
    q?: string;
    status?: ProductStatus | "all";
    category?: string;
    sort?: "newest" | "price_asc" | "price_desc";
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    pageSize?: number;
    /** Alias for pageSize */
    limit?: number;
    defaultPageSize?: number;
  },
): Promise<ProductListPage> {
  const { page, pageSize, offset } = normalizePagination({
    page: opts?.page,
    pageSize: opts?.pageSize,
    limit: opts?.limit,
    defaultPageSize: opts?.defaultPageSize ?? ADMIN_PAGE_SIZE,
  });
  const where = productListWhere(shopId, opts);
  const sort = opts?.sort ?? "newest";
  const orderBy =
    sort === "price_asc"
      ? [asc(products.price), desc(products.updatedAt)]
      : sort === "price_desc"
        ? [desc(products.price), desc(products.updatedAt)]
        : [desc(products.updatedAt)];

  const [rows, countRow] = await Promise.all([
    db.query.products.findMany({
      where,
      with: {
        images: {
          orderBy: (img, { asc: orderAsc }) => [orderAsc(img.sortOrder)],
        },
      },
      orderBy,
      limit: pageSize,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
  ]);

  const total = countRow[0]?.count ?? 0;
  const pagination = buildPageMeta(total, page, pageSize);

  // If the requested page is past the end, refetch the last page.
  if (pagination.page !== page && total > 0) {
    const retryOffset = (pagination.page - 1) * pageSize;
    const retryRows = await db.query.products.findMany({
      where,
      with: {
        images: {
          orderBy: (img, { asc: orderAsc }) => [orderAsc(img.sortOrder)],
        },
      },
      orderBy,
      limit: pageSize,
      offset: retryOffset,
    });
    return { products: retryRows, pagination };
  }

  return { products: rows, pagination };
}

export async function listPublishedProductsForShop(
  shopId: string,
  opts?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    sort?: "newest" | "price_asc" | "price_desc";
    minPrice?: number;
    maxPrice?: number;
  },
) {
  return listProductsForShop(shopId, {
    status: "published",
    page: opts?.page,
    pageSize: opts?.pageSize,
    q: opts?.q,
    category: opts?.category,
    sort: opts?.sort,
    minPrice: opts?.minPrice,
    maxPrice: opts?.maxPrice,
    defaultPageSize: 24,
  });
}

/** Min/max published prices for shop filter UI. */
export async function getPublishedPriceBoundsForShop(shopId: string) {
  const [row] = await db
    .select({
      min: sql<string | null>`min(${products.price}::numeric)`,
      max: sql<string | null>`max(${products.price}::numeric)`,
    })
    .from(products)
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.status, "published"),
        sql`${products.price} is not null`,
      ),
    );

  const min = row?.min != null ? Number(row.min) : null;
  const max = row?.max != null ? Number(row.max) : null;
  return {
    min: min != null && Number.isFinite(min) ? min : null,
    max: max != null && Number.isFinite(max) ? max : null,
  };
}

/** Distinct categories used by published products in a shop. */
export async function listPublishedCategoriesForShop(shopId: string) {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.status, "published"),
        sql`${products.category} is not null and btrim(${products.category}) <> ''`,
      ),
    )
    .orderBy(asc(products.category));

  return rows
    .map((row) => row.category?.trim())
    .filter((value): value is string => Boolean(value));
}

/** Other published products from the same shop (for product page “more from”). */
export async function listMoreFromShop(
  shopId: string,
  excludeProductId: string,
  limit = 8,
) {
  return db.query.products.findMany({
    where: and(
      eq(products.shopId, shopId),
      eq(products.status, "published"),
      ne(products.id, excludeProductId),
    ),
    with: {
      images: {
        orderBy: (img, { asc: orderAsc }) => [orderAsc(img.sortOrder)],
      },
    },
    orderBy: [desc(products.updatedAt)],
    limit,
  });
}

export async function countProductsByStatus(shopId: string) {
  const rows = await db
    .select({
      status: products.status,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(eq(products.shopId, shopId))
    .groupBy(products.status);

  const counts = {
    draft: 0,
    published: 0,
    sold: 0,
    archived: 0,
    total: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

export async function createManualProduct(
  input: {
    shop: Shop;
  } & ProductUpdateInput & { title: string },
): Promise<ProductWithImages> {
  const title = input.title.trim();
  const baseSlug = slugify(title).slice(0, 40) || "item";
  const slug = `${baseSlug}-${uniqueSlugHint(`${input.shop.id}-${Date.now()}`)}`;

  const [product] = await db
    .insert(products)
    .values({
      shopId: input.shop.id,
      slug,
      title,
      description: input.description?.trim() || null,
      price: numOrNull(input.price ?? null) ?? null,
      compareAtPrice: numOrNull(input.compareAtPrice ?? null) ?? null,
      currency:
        input.currency?.trim() || input.shop.settings.defaultCurrency || "ETB",
      category: input.category?.trim() || null,
      sku: input.sku?.trim() || null,
      stockQuantity:
        input.stockQuantity === undefined
          ? null
          : input.stockQuantity,
      tags: input.tags?.trim() || null,
      status: input.status ?? "draft",
      confidence: null,
      rawCaption: null,
    })
    .returning();

  return { ...product, images: [] };
}

export async function updateProduct(
  productId: string,
  input: ProductUpdateInput,
): Promise<Product> {
  const [updated] = await db
    .update(products)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.price !== undefined ? { price: numOrNull(input.price) } : {}),
      ...(input.compareAtPrice !== undefined
        ? { compareAtPrice: numOrNull(input.compareAtPrice) }
        : {}),
      ...(input.currency !== undefined
        ? { currency: input.currency.trim() || "ETB" }
        : {}),
      ...(input.category !== undefined
        ? { category: input.category?.trim() || null }
        : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.stockQuantity !== undefined
        ? { stockQuantity: input.stockQuantity }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags?.trim() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId))
    .returning();

  if (!updated) {
    throw new Error("Product not found");
  }
  return updated;
}

export async function archiveProduct(productId: string): Promise<Product> {
  return updateProduct(productId, { status: "archived" });
}

export async function deleteProduct(productId: string): Promise<void> {
  const imgs = await db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
  });
  await Promise.all(imgs.map((img) => deleteLocalProductImage(img.url)));
  await db.delete(products).where(eq(products.id, productId));
}

export async function addProductImage(input: {
  productId: string;
  url?: string | null;
  telegramFileId?: string | null;
  alt?: string | null;
}): Promise<ProductImage> {
  const existing = await db.query.productImages.findMany({
    where: eq(productImages.productId, input.productId),
    orderBy: [desc(productImages.sortOrder)],
    limit: 1,
  });
  const nextOrder = (existing[0]?.sortOrder ?? -1) + 1;

  const [row] = await db
    .insert(productImages)
    .values({
      productId: input.productId,
      url: input.url ?? null,
      telegramFileId: input.telegramFileId ?? null,
      alt: input.alt ?? null,
      sortOrder: nextOrder,
    })
    .returning();

  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, input.productId));

  return row;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  const image = await db.query.productImages.findFirst({
    where: eq(productImages.id, imageId),
  });
  if (!image) return;
  await deleteLocalProductImage(image.url);
  await db.delete(productImages).where(eq(productImages.id, imageId));
  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, image.productId));
}

export async function reorderProductImages(
  productId: string,
  orderedIds: string[],
): Promise<ProductImage[]> {
  const existing = await db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
  });
  const idSet = new Set(existing.map((i) => i.id));
  if (
    orderedIds.length !== existing.length ||
    orderedIds.some((id) => !idSet.has(id))
  ) {
    throw new Error("Invalid image order");
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(productImages)
        .set({ sortOrder: index })
        .where(eq(productImages.id, id)),
    ),
  );

  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, productId));

  return db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
    orderBy: [asc(productImages.sortOrder)],
  });
}

export function productImageSrc(image: {
  url?: string | null;
  telegramFileId?: string | null;
}) {
  if (image.url) return image.url;
  if (image.telegramFileId) {
    return `/api/media/telegram/${encodeURIComponent(image.telegramFileId)}`;
  }
  return null;
}

export function serializeProduct(
  product: (ProductWithImages | Product) & {
    channel?: { username?: string | null } | null;
  },
) {
  const images = "images" in product ? product.images : [];
  return {
    id: product.id,
    shopId: product.shopId,
    channelId: product.channelId,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price: product.price !== null ? Number(product.price) : null,
    compareAtPrice:
      product.compareAtPrice !== null && product.compareAtPrice !== undefined
        ? Number(product.compareAtPrice)
        : null,
    currency: product.currency,
    category: product.category,
    sku: product.sku,
    stockQuantity: product.stockQuantity,
    tags: product.tags,
    status: product.status,
    confidence:
      product.confidence !== null ? Number(product.confidence) : null,
    rawCaption: product.rawCaption,
    sourceChatId:
      product.sourceChatId != null ? product.sourceChatId.toString() : null,
    sourceMessageId: product.sourceMessageId,
    telegramUrl: telegramMessageUrl({
      username: product.channel?.username,
      chatId: product.sourceChatId,
      messageId: product.sourceMessageId,
    }),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    images: images.map((img) => ({
      id: img.id,
      telegramFileId: img.telegramFileId,
      url: img.url,
      alt: img.alt,
      sortOrder: img.sortOrder,
      src: productImageSrc(img),
    })),
  };
}

export function formatPrice(product: Product) {
  if (product.price == null) return null;
  const amount = Number(product.price);
  if (!Number.isFinite(amount)) return null;
  return `${product.currency} ${amount.toLocaleString()}`;
}

export function pickBestPhotoFileId(
  photos: { file_id: string; file_size?: number; width?: number }[],
): string | null {
  if (!photos.length) return null;
  const sorted = [...photos].sort(
    (a, b) => (b.file_size ?? b.width ?? 0) - (a.file_size ?? a.width ?? 0),
  );
  return sorted[0]?.file_id ?? null;
}
