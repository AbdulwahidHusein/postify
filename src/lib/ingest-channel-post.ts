import "server-only";

import type { Message } from "grammy/types";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages, products, shops } from "@/db/schema";
import type { Channel, Product } from "@/db/schema";
import {
  createProductFromChannelPost,
  pickBestPhotoFileId,
  type ChannelIngestResult,
} from "@/lib/products";
import { parseListingCaption } from "@/lib/parse-listing";
import { normalizeShopSettings } from "@/lib/shops";

type IngestReplyHandlers = {
  onListed: (product: Product) => Promise<void>;
  onDraft: (product: Product) => Promise<void>;
  onSkipped: (reason: string) => Promise<void>;
};

async function getShop(shopId: string) {
  return db.query.shops.findFirst({ where: eq(shops.id, shopId) });
}

function extractPhotos(message: Message) {
  const fileId = message.photo ? pickBestPhotoFileId(message.photo) : null;
  return fileId ? [{ fileId }] : [];
}

async function replyForResult(
  result: ChannelIngestResult,
  handlers: IngestReplyHandlers,
) {
  if (result.outcome === "skipped") {
    await handlers.onSkipped(result.reason);
    return;
  }
  if (result.outcome === "duplicate") {
    return;
  }
  if (result.product.status === "draft") {
    await handlers.onDraft(result.product);
    return;
  }
  await handlers.onListed(result.product);
}

async function findByMediaGroup(shopId: string, mediaGroupId: string) {
  return db.query.products.findFirst({
    where: and(
      eq(products.shopId, shopId),
      eq(products.sourceMediaGroupId, mediaGroupId),
    ),
  });
}

async function appendPhotos(
  productId: string,
  photos: { fileId: string }[],
  caption?: string,
) {
  if (photos.length) {
    const existing = await db.query.productImages.findMany({
      where: eq(productImages.productId, productId),
    });
    const known = new Set(
      existing.map((img) => img.telegramFileId).filter(Boolean),
    );
    const start = existing.length;
    const fresh = photos.filter((p) => !known.has(p.fileId));
    if (fresh.length) {
      await db.insert(productImages).values(
        fresh.map((photo, index) => ({
          productId,
          telegramFileId: photo.fileId,
          sortOrder: start + index,
        })),
      );
    }
  }

  const trimmed = caption?.trim();
  if (trimmed) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    });
    if (product && !product.rawCaption?.trim()) {
      const shop = await getShop(product.shopId);
      if (shop) {
        const settings = normalizeShopSettings(shop.settings);
        const parsed = parseListingCaption(trimmed, {
          defaultCurrency: settings.defaultCurrency,
          hasMedia: true,
        });
        await db
          .update(products)
          .set({
            title: parsed.title,
            description: parsed.description || null,
            price: parsed.price !== null ? String(parsed.price) : null,
            currency: parsed.currency ?? settings.defaultCurrency,
            confidence: String(parsed.confidence),
            rawCaption: trimmed,
            status: "published",
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
        return;
      }
    }
  }

  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, productId));
}

/**
 * Albums (media groups) arrive as one webhook update per photo.
 * Create the product on the first part (reply once), append images on later parts.
 * No setTimeout — webhook handlers must finish while the request is alive.
 */
export async function ingestChannelListing(input: {
  channel: Channel;
  message: Message;
  onListed: (product: Product) => Promise<void>;
  onDraft: (product: Product) => Promise<void>;
  onSkipped: (reason: string) => Promise<void>;
}) {
  const { channel, message } = input;
  const handlers: IngestReplyHandlers = {
    onListed: input.onListed,
    onDraft: input.onDraft,
    onSkipped: input.onSkipped,
  };
  const chatId = BigInt(message.chat.id);
  const caption = (message.text ?? message.caption ?? "").trim();
  const photos = extractPhotos(message);
  const mediaGroupId = message.media_group_id ?? null;

  const shop = await getShop(channel.shopId);
  if (!shop) return;

  if (mediaGroupId) {
    const existing = await findByMediaGroup(shop.id, mediaGroupId);
    if (existing) {
      await appendPhotos(existing.id, photos, caption);
      // Already replied when the first album part was ingested.
      return;
    }
  }

  const result = await createProductFromChannelPost({
    shop,
    channel,
    caption,
    messageId: message.message_id,
    chatId,
    mediaGroupId,
    photos,
  });

  // Race: two album parts arrived before either insert finished.
  if (mediaGroupId && result.outcome === "duplicate") {
    await appendPhotos(result.product.id, photos, caption);
    return;
  }

  if (mediaGroupId && result.outcome === "skipped") {
    const raced = await findByMediaGroup(shop.id, mediaGroupId);
    if (raced) {
      await appendPhotos(raced.id, photos, caption);
      return;
    }
  }

  await replyForResult(result, handlers);
}
