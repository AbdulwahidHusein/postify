import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";
import { Api } from "grammy";
import { db } from "@/db";
import {
  channels,
  notificationOutbox,
  productImages,
  products,
  shops,
  type Channel,
  type Product,
} from "@/db/schema";
import {
  createProductFromChannelPost,
  type ChannelIngestResult,
} from "@/lib/products";
import {
  extractListingFromCaption,
  formatListingTags,
} from "@/lib/llm/extract-listing";
import { processOutboxJobs } from "@/lib/chat/outbox";
import { normalizeShopSettings } from "@/lib/shops";
import { requireBotToken, serverEnv } from "@/lib/env.server";

type IngestReplyHandlers = {
  onListed: (product: Product) => Promise<void>;
  onDraft: (product: Product) => Promise<void>;
  onSkipped: (reason: string) => Promise<void>;
};

async function getShop(shopId: string) {
  return db.query.shops.findFirst({ where: eq(shops.id, shopId) });
}

async function getChannelById(channelId: string) {
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  });
  return channel ?? null;
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
        const parsed = await extractListingFromCaption(trimmed, {
          defaultCurrency: settings.defaultCurrency,
          hasMedia: true,
          preferredCategories: settings.sellCategories ?? [],
        });
        await db
          .update(products)
          .set({
            title: parsed.title,
            description: parsed.description || null,
            price: parsed.price !== null ? String(parsed.price) : null,
            compareAtPrice:
              parsed.compareAtPrice !== null
                ? String(parsed.compareAtPrice)
                : null,
            currency: parsed.currency ?? settings.defaultCurrency,
            category: parsed.category,
            sku: parsed.sku,
            tags: formatListingTags(parsed.tags),
            confidence: String(parsed.confidence),
            rawCaption: trimmed,
            status:
              parsed.confidence >= (settings.autoPublishMinConfidence ?? 0.8)
                ? "published"
                : "draft",
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
 * The LLM extract happens here — this must run off-request (see enqueue/flush below).
 */
export async function ingestChannelListing(input: {
  channel: Channel;
  chatId: bigint;
  messageId: number;
  mediaGroupId: string | null;
  caption: string;
  photos: { fileId: string }[];
  onListed: (product: Product) => Promise<void>;
  onDraft: (product: Product) => Promise<void>;
  onSkipped: (reason: string) => Promise<void>;
}) {
  const { channel, chatId, messageId, mediaGroupId, caption, photos } = input;
  const handlers: IngestReplyHandlers = {
    onListed: input.onListed,
    onDraft: input.onDraft,
    onSkipped: input.onSkipped,
  };

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
    messageId,
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

// ── Off-request ingest via the notification_outbox ──────────────────────────
// The webhook handler enqueues a job and ACKs immediately; the LLM + product
// creation + reply run later via flushIngestOutbox (webhook tail-flush / cron),
// so Telegram never sees a slow webhook and never retries a half-finished job.

export type IngestJobPayload = {
  channelId: string;
  chatId: string; // bigint as string (JSON-safe)
  messageId: number;
  mediaGroupId: string | null;
  caption: string;
  photos: { fileId: string }[];
};

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

/** Reply with an "Open in shop" button on the channel post (best-effort). */
async function replyOpenInShop(chatId: bigint, productSlug: string) {
  const url = `${appUrl()}/p/${productSlug}`;
  const reply_markup = {
    inline_keyboard: [[{ text: "Open in shop", url }]],
  };
  const bot = new Api(requireBotToken());
  try {
    await bot.sendMessage(Number(chatId), "\u2800", {
      reply_markup: reply_markup as never,
    });
    return;
  } catch (error) {
    console.warn("[ingest] braille-blank reply failed, falling back", error);
  }
  await bot.sendMessage(Number(chatId), "Open in shop", {
    reply_markup: reply_markup as never,
  });
}

export async function enqueueIngestChannelPost(input: {
  channelId: string;
  chatId: bigint;
  messageId: number;
  mediaGroupId: string | null;
  caption: string;
  photos: { fileId: string }[];
}) {
  await db.insert(notificationOutbox).values({
    kind: "ingest_channel_post",
    payload: {
      channelId: input.channelId,
      chatId: input.chatId.toString(),
      messageId: input.messageId,
      mediaGroupId: input.mediaGroupId,
      caption: input.caption,
      photos: input.photos,
    },
    status: "pending",
    nextAttemptAt: new Date(),
  });
  // Deliberately do NOT flush here — ingest runs the LLM and must happen
  // off-request so the webhook ACKs immediately (see ARCHITECTURE.md).
}

async function processIngestJob(payload: IngestJobPayload) {
  const channel = await getChannelById(payload.channelId);
  if (!channel) return; // channel/shop removed since enqueue
  const chatId = BigInt(payload.chatId);
  await ingestChannelListing({
    channel,
    chatId,
    messageId: payload.messageId,
    mediaGroupId: payload.mediaGroupId,
    caption: payload.caption,
    photos: payload.photos,
    onListed: (product) => replyOpenInShop(chatId, product.slug),
    onDraft: (product) => replyOpenInShop(chatId, product.slug),
    onSkipped: async () => {},
  });
}

/** Process pending ingest jobs (LLM + product creation + reply). Off-request. */
export async function flushIngestOutbox(limit = 6) {
  const now = new Date();
  const jobs = await db.query.notificationOutbox.findMany({
    where: and(
      eq(notificationOutbox.status, "pending"),
      eq(notificationOutbox.kind, "ingest_channel_post"),
      lte(notificationOutbox.nextAttemptAt, now),
    ),
    orderBy: [asc(notificationOutbox.createdAt)],
    limit,
  });
  return processOutboxJobs(jobs, (job) =>
    processIngestJob(job.payload as IngestJobPayload),
  );
}
