import "server-only";

import { and, asc, eq, lt } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import {
  cartLines,
  carts,
  productImages,
  productVariants,
  products,
} from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { imageSrc } from "@/server/domain/products";

const CART_TTL_MS = 7 * 86_400_000;
export const MAX_CART_LINES = 20;
export const MAX_LINE_QTY = 99;

export async function getOrCreateCart(shopId: string, ownerKey: string, tx: DbOrTx = db) {
  const expiresAt = new Date(Date.now() + CART_TTL_MS);
  const [row] = await tx
    .insert(carts)
    .values({ shopId, ownerKey, expiresAt })
    .onConflictDoUpdate({
      target: [carts.shopId, carts.ownerKey],
      set: { expiresAt, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function findCart(shopId: string, ownerKey: string, tx: DbOrTx = db) {
  return (
    (await tx.query.carts.findFirst({
      where: and(eq(carts.shopId, shopId), eq(carts.ownerKey, ownerKey)),
    })) ?? null
  );
}

export type CartLineView = {
  variantId: string;
  productId: string;
  productCode: string;
  slug: string;
  title: string;
  variantTitle: string | null;
  image: string | null;
  quantity: number;
  unitPriceMinor: string | null;
  currency: string;
  available: boolean;
  maxQty: number;
  sourceCode: string | null;
  problem: "unavailable" | "no_price" | "insufficient" | null;
};

export async function readCart(shopId: string, ownerKey: string, tx: DbOrTx = db) {
  const cart = await findCart(shopId, ownerKey, tx);
  if (!cart) return { cartId: null, lines: [] as CartLineView[], subtotalMinor: "0", currency: "ETB", count: 0 };
  const rows = await tx
    .select({ line: cartLines, variant: productVariants, product: products })
    .from(cartLines)
    .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartLines.cartId, cart.id))
    .orderBy(asc(cartLines.addedAt));

  const lines: CartLineView[] = [];
  let subtotal = 0n;
  let currency = "ETB";
  for (const { line, variant, product } of rows) {
    const cover = await tx.query.productImages.findFirst({
      where: eq(productImages.productId, product.id),
      orderBy: [asc(productImages.position)],
    });
    const maxQty = variant.trackInventory ? Math.min(variant.inventoryQty, MAX_LINE_QTY) : MAX_LINE_QTY;
    const problem =
      product.status !== "published"
        ? "unavailable"
        : variant.priceMinor === null
          ? "no_price"
          : maxQty <= 0
            ? "unavailable"
            : line.quantity > maxQty
              ? "insufficient"
              : null;
    if (!problem && variant.priceMinor !== null) subtotal += variant.priceMinor * BigInt(line.quantity);
    currency = variant.currency;
    lines.push({
      variantId: variant.id,
      productId: product.id,
      productCode: product.code,
      slug: product.slug,
      title: product.title,
      variantTitle: variant.title === "Default" ? null : variant.title,
      image: cover ? imageSrc(cover, 320) : null,
      quantity: line.quantity,
      unitPriceMinor: variant.priceMinor?.toString() ?? null,
      currency: variant.currency,
      available: problem === null,
      maxQty: Math.max(0, maxQty),
      sourceCode: line.sourceCode,
      problem,
    });
  }
  return {
    cartId: cart.id,
    lines,
    subtotalMinor: subtotal.toString(),
    currency,
    count: lines.reduce((a, l) => a + l.quantity, 0),
  };
}

export async function addToCart(input: {
  shopId: string;
  ownerKey: string;
  variantId: string;
  quantity: number;
  sourceCode?: string | null;
}) {
  const qty = Math.max(1, Math.min(MAX_LINE_QTY, Math.floor(input.quantity)));
  const variant = await db.query.productVariants.findFirst({
    where: and(eq(productVariants.id, input.variantId), eq(productVariants.shopId, input.shopId)),
    with: { product: true },
  });
  if (!variant) throw notFound("Item not found");
  if (variant.product.status !== "published") throw new AppError("This item is no longer available", 409, "unavailable");
  if (variant.priceMinor === null) throw new AppError("Ask the seller for the price of this item", 409, "no_price");
  if (variant.trackInventory && variant.inventoryQty <= 0) {
    throw new AppError("This item is sold out", 409, "sold_out");
  }

  return db.transaction(async (tx) => {
    const cart = await getOrCreateCart(input.shopId, input.ownerKey, tx);
    const existing = await tx.query.cartLines.findFirst({
      where: and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variant.id)),
    });
    if (!existing) {
      const count = await tx.select({ v: cartLines.variantId }).from(cartLines).where(eq(cartLines.cartId, cart.id));
      if (count.length >= MAX_CART_LINES) throw new AppError("Your cart is full");
    }
    const max = variant.trackInventory ? variant.inventoryQty : MAX_LINE_QTY;
    const nextQty = Math.min(max, (existing?.quantity ?? 0) + qty, MAX_LINE_QTY);
    await tx
      .insert(cartLines)
      .values({ cartId: cart.id, variantId: variant.id, quantity: nextQty, sourceCode: input.sourceCode ?? null })
      .onConflictDoUpdate({
        target: [cartLines.cartId, cartLines.variantId],
        set: { quantity: nextQty, ...(input.sourceCode ? { sourceCode: input.sourceCode } : {}) },
      });
    return readCart(input.shopId, input.ownerKey, tx);
  });
}

export async function setLineQuantity(input: {
  shopId: string;
  ownerKey: string;
  variantId: string;
  quantity: number;
}) {
  const cart = await findCart(input.shopId, input.ownerKey);
  if (!cart) return readCart(input.shopId, input.ownerKey);
  if (input.quantity <= 0) {
    await db
      .delete(cartLines)
      .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, input.variantId)));
  } else {
    await db
      .update(cartLines)
      .set({ quantity: Math.min(MAX_LINE_QTY, Math.floor(input.quantity)) })
      .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, input.variantId)));
  }
  return readCart(input.shopId, input.ownerKey);
}

export async function purgeExpiredCarts() {
  const deleted = await db.delete(carts).where(lt(carts.expiresAt, new Date())).returning({ id: carts.id });
  return deleted.length;
}
