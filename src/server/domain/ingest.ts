import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Message } from "grammy/types";
import { db } from "@/server/db";
import {
  channels,
  productImages,
  productSources,
  productVariants,
  products,
  shops,
  telegramUpdates,
  type Channel,
  type Shop,
  type TelegramUpdateRow,
} from "@/server/db/schema";
import { sha256, shortCode } from "@/server/ids";
import { log } from "@/server/log";
import { enqueue } from "@/server/services/tasks";
import { reconcileListing } from "@/lib/catalog/resolve";
import { toMinor } from "@/lib/money";
import { extractWithGuardrails } from "@/server/domain/ai-guard";
import { insertProduct } from "@/server/domain/products";
import { scheduleButtonSync } from "@/server/domain/buttons";
import { normalizeSettings } from "@/server/domain/shops";
import { isGroupType, userIsChatAdmin } from "@/server/domain/channels";
import {
  captionSaysSold,
  looksLikeListing,
  normalizeCaption,
  telegramGroupKey,
} from "@/server/domain/ingest-rules";
import { trackEvent } from "@/server/domain/analytics";

type ListingMessage = Message & { edit_date?: number };

export const MAX_EXTRACTIONS_PER_POST_PER_DAY = 3;

// ── webhook side: store + enqueue (fast, no AI) ─────────────────────────────
function bestPhotoFileId(msg: ListingMessage): string | null {
  const sizes = msg.photo;
  if (!sizes?.length) return null;
  const best = [...sizes].sort((a, b) => (b.file_size ?? b.width) - (a.file_size ?? a.width))[0];
  return best?.file_id ?? null;
}

function captionOf(msg: ListingMessage): string {
  return normalizeCaption(msg.caption ?? msg.text ?? "");
}

/**
 * Store a listing-candidate update and enqueue its ingest job. Duplicate
 * deliveries of the same update are no-ops (update_id primary key). Album
 * photos share one task name, so an album becomes one job and one AI call.
 */
export async function acceptListingUpdate(input: {
  updateId: number;
  message: ListingMessage;
  isEdit: boolean;
}): Promise<"queued" | "duplicate"> {
  const msg = input.message;
  const chatId = BigInt(msg.chat.id);
  const groupKey = telegramGroupKey({ chatId, messageId: msg.message_id, mediaGroupId: msg.media_group_id });

  const inserted = await db
    .insert(telegramUpdates)
    .values({
      updateId: BigInt(input.updateId),
      chatId,
      messageId: msg.message_id,
      mediaGroupId: msg.media_group_id ?? null,
      isEdit: input.isEdit,
      groupKey,
      payload: msg as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ updateId: telegramUpdates.updateId });
  if (!inserted.length) return "duplicate";

  await db.update(channels).set({ lastPostAt: new Date() }).where(eq(channels.telegramChatId, chatId));

  const delaySeconds = msg.media_group_id ? 3 : 1;
  const name = input.isEdit ? `${groupKey}:e:${msg.edit_date ?? 0}:${msg.message_id}` : groupKey;
  const res = await enqueue("ingest", { groupKey }, { name, delaySeconds });
  if (res === "duplicate" && msg.media_group_id && !input.isEdit) {
    // A late album part after the album's job ran: give it its own job.
    await enqueue("ingest", { groupKey }, { name: `${groupKey}:late:${msg.message_id}`, delaySeconds: 2 });
  }
  return "queued";
}

/** Cheap check used by the webhook before storing anything. */
export function isListingCandidate(msg: ListingMessage): boolean {
  if (msg.from?.is_bot && !msg.sender_chat) return false;
  return looksLikeListing({ caption: captionOf(msg), photoCount: msg.photo?.length ? 1 : 0 });
}

// ── job side ────────────────────────────────────────────────────────────────
export type IngestOutcome =
  | { kind: "created"; productId: string; status: string }
  | { kind: "appended"; productId: string }
  | { kind: "edited"; productId: string }
  | { kind: "skipped"; reason: string }
  | { kind: "nothing" };

async function claim(groupKey: string): Promise<TelegramUpdateRow[]> {
  return db
    .update(telegramUpdates)
    .set({ status: "processing", attempts: sql`${telegramUpdates.attempts} + 1` })
    .where(and(eq(telegramUpdates.groupKey, groupKey), eq(telegramUpdates.status, "pending")))
    .returning();
}

async function finish(rows: TelegramUpdateRow[], status: "done" | "skipped", note?: string) {
  if (!rows.length) return;
  await db
    .update(telegramUpdates)
    .set({ status, processedAt: new Date(), lastError: note ?? null })
    .where(inArray(telegramUpdates.updateId, rows.map((r) => r.updateId)));
}

async function release(rows: TelegramUpdateRow[], error: unknown) {
  if (!rows.length) return;
  await db
    .update(telegramUpdates)
    .set({
      status: "pending",
      lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    })
    .where(inArray(telegramUpdates.updateId, rows.map((r) => r.updateId)));
}

export async function processIngest(groupKey: string): Promise<IngestOutcome> {
  const rows = await claim(groupKey);
  if (!rows.length) return { kind: "nothing" };
  try {
    const outcome = await ingestRows(rows);
    await finish(rows, outcome.kind === "skipped" ? "skipped" : "done", outcome.kind === "skipped" ? outcome.reason : undefined);
    return outcome;
  } catch (err) {
    await release(rows, err);
    throw err;
  }
}

async function ingestRows(rows: TelegramUpdateRow[]): Promise<IngestOutcome> {
  const chatId = rows[0].chatId;
  const channel = await db.query.channels.findFirst({ where: eq(channels.telegramChatId, chatId) });
  if (!channel || channel.status !== "connected") return { kind: "skipped", reason: "chat not linked" };
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, channel.shopId) });
  if (!shop) return { kind: "skipped", reason: "shop missing" };

  let messages = rows
    .map((r) => r.payload as unknown as ListingMessage)
    .sort((a, b) => a.message_id - b.message_id);

  if (isGroupType(channel.chatType)) {
    messages = await onlyAdminPosts(chatId, messages);
    if (!messages.length) return { kind: "skipped", reason: "not an admin post" };
  }

  const newMsgs = messages.filter((m) => !m.edit_date);
  const editMsgs = messages.filter((m) => m.edit_date);
  let outcome: IngestOutcome = { kind: "skipped", reason: "empty" };
  if (newMsgs.length) outcome = await createOrAppend(shop, channel, newMsgs);
  if (editMsgs.length) {
    const edited = await applyEdit(shop, channel, editMsgs);
    if (outcome.kind === "skipped") outcome = edited;
  }
  return outcome;
}

async function onlyAdminPosts(chatId: bigint, messages: ListingMessage[]) {
  const cache = new Map<number, boolean>();
  const out: ListingMessage[] = [];
  for (const m of messages) {
    // Anonymous admins post as the group itself.
    if (m.sender_chat && BigInt(m.sender_chat.id) === chatId) {
      out.push(m);
      continue;
    }
    const uid = m.from?.id;
    if (!uid || m.from?.is_bot) continue;
    if (!cache.has(uid)) cache.set(uid, await userIsChatAdmin(chatId, uid));
    if (cache.get(uid)) out.push(m);
  }
  return out;
}

async function findSource(chatId: bigint, messages: ListingMessage[]) {
  const albumId = messages.find((m) => m.media_group_id)?.media_group_id;
  if (albumId) {
    const byAlbum = await db.query.productSources.findFirst({
      where: and(eq(productSources.chatId, chatId), eq(productSources.mediaGroupId, albumId)),
    });
    if (byAlbum) return byAlbum;
  }
  const ids = messages.map((m) => m.message_id);
  return (
    (await db.query.productSources.findFirst({
      where: and(eq(productSources.chatId, chatId), inArray(productSources.messageId, ids)),
    })) ?? null
  );
}

async function appendPhotos(
  source: { id: string; productId: string; shopId: string; messageIds: number[] },
  messages: ListingMessage[],
): Promise<IngestOutcome> {
  const existing = await db.query.productImages.findMany({
    where: eq(productImages.productId, source.productId),
    orderBy: [asc(productImages.position)],
  });
  const known = new Set(existing.map((i) => i.telegramFileId).filter(Boolean));
  const fresh = messages
    .map((m) => bestPhotoFileId(m))
    .filter((f): f is string => Boolean(f) && !known.has(f));
  if (fresh.length) {
    const inserted = await db
      .insert(productImages)
      .values(
        fresh.map((fileId, i) => ({
          productId: source.productId,
          shopId: source.shopId,
          telegramFileId: fileId,
          position: existing.length + i,
        })),
      )
      .returning({ id: productImages.id });
    for (const img of inserted) await enqueue("media", { imageId: img.id }, { name: img.id });
  }
  const ids = Array.from(new Set([...source.messageIds, ...messages.map((m) => m.message_id)])).sort((a, b) => a - b);
  await db
    .update(productSources)
    .set({ messageIds: ids, updatedAt: new Date() })
    .where(eq(productSources.id, source.id));
  return { kind: "appended", productId: source.productId };
}

function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function createOrAppend(
  shop: Shop,
  channel: Channel,
  messages: ListingMessage[],
): Promise<IngestOutcome> {
  if (!messages.length) return { kind: "skipped", reason: "no messages" };
  const existing = await findSource(channel.telegramChatId, messages);
  // Posts the bot published itself come back as channel posts: nothing to do.
  if (existing?.buttonMode === "bot_post") return { kind: "skipped", reason: "bot's own post" };
  if (existing) return appendPhotos(existing, messages);

  const settings = normalizeSettings(shop.settings);
  if (settings.ingestMode === "paused") return { kind: "skipped", reason: "ingest paused" };

  const caption = messages.map(captionOf).find(Boolean) ?? "";
  const photoIds = messages.map(bestPhotoFileId).filter((f): f is string => Boolean(f));
  if (!looksLikeListing({ caption, photoCount: photoIds.length })) {
    return { kind: "skipped", reason: "no photo or price" };
  }

  const extraction = await extractWithGuardrails(shop, caption, {
    defaultCurrency: shop.currency,
    hasMedia: photoIds.length > 0,
    preferredCategories: settings.sellCategories,
  });
  const listing = extraction.listing;
  if (!listing.isProduct && photoIds.length === 0) {
    return { kind: "skipped", reason: "not a product" };
  }

  const recon = reconcileListing({
    category: listing.category,
    brand: listing.brand,
    model: listing.model,
    condition: listing.condition,
    preferredCategories: settings.sellCategories,
  });

  const priceMinor = listing.price !== null ? toMinor(listing.price) : null;
  const compareAtMinor = listing.compareAtPrice !== null ? toMinor(listing.compareAtPrice) : null;
  const confirmNeeded = !listing.isProduct;
  const needsPrice = priceMinor === null;
  const lowConfidence = listing.confidence < settings.autoPublishMinConfidence;
  const publish =
    settings.ingestMode === "auto_publish" &&
    !extraction.limited &&
    !confirmNeeded &&
    !needsPrice &&
    !lowConfidence;
  const reason = confirmNeeded
    ? "confirm"
    : extraction.limited
      ? "limited"
      : needsPrice
        ? "needs_price"
        : !publish
          ? settings.ingestMode === "always_draft"
            ? "review"
            : "low_confidence"
          : "published";

  const first = messages[0];
  const hadForeignMarkup = messages.some((m) => Boolean(m.reply_markup));
  let created: { productId: string; sourceId: string; imageIds: string[] };
  try {
    created = await db.transaction(async (tx) => {
      const bundle = await insertProduct(tx, {
        shopId: shop.id,
        title: listing.title,
        description: listing.description || null,
        category: recon.category,
        brand: recon.brand,
        model: recon.model,
        condition: recon.condition,
        location: listing.location,
        attributes: recon.attributes,
        tags: listing.tags,
        isNegotiable: listing.isNegotiable,
        status: publish ? "published" : "draft",
        aiConfidence: listing.confidence,
        rawCaption: caption || null,
        needsPrice,
        slugHint: listing.slugHint,
        variant: {
          priceMinor,
          compareAtMinor,
          currency: listing.currency ?? shop.currency,
          sku: listing.sku,
          trackInventory: true,
          inventoryQty: 1,
        },
        images: photoIds.map((telegramFileId) => ({ telegramFileId })),
      });
      const [source] = await tx
        .insert(productSources)
        .values({
          code: shortCode(8),
          productId: bundle.id,
          shopId: shop.id,
          channelId: channel.id,
          chatId: channel.telegramChatId,
          messageId: first.message_id,
          mediaGroupId: first.media_group_id ?? null,
          messageIds: messages.map((m) => m.message_id),
          captionHash: caption ? sha256(caption) : null,
          extractDay: new Date().toISOString().slice(0, 10),
          hadForeignMarkup,
        })
        .returning({ id: productSources.id });
      return { productId: bundle.id, sourceId: source.id, imageIds: bundle.images.map((i) => i.id) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await findSource(channel.telegramChatId, messages);
      if (raced) return appendPhotos(raced, messages);
    }
    throw err;
  }

  for (const imageId of created.imageIds) await enqueue("media", { imageId }, { name: imageId });
  if (publish) await scheduleButtonSync([created.sourceId]);
  await enqueue(
    "notify",
    { kind: "listing_receipt", productId: created.productId, reason },
    { name: `listing_receipt:${created.productId}` },
  );
  await trackEvent({
    shopId: shop.id,
    type: "listing_ingested",
    productId: created.productId,
    data: { via: extraction.via, reason, chatType: channel.chatType },
  });
  log.info("listing ingested", { shop_id: shop.id, product_id: created.productId, reason, via: extraction.via });
  return { kind: "created", productId: created.productId, status: publish ? "published" : "draft" };
}

async function applyEdit(shop: Shop, channel: Channel, messages: ListingMessage[]): Promise<IngestOutcome> {
  const source = await findSource(channel.telegramChatId, messages);
  if (!source) {
    // The original post was never ingested (e.g. it had no price); treat the edit as new.
    return createOrAppend(shop, channel, messages.map((m) => ({ ...m, edit_date: undefined })));
  }
  const product = await db.query.products.findFirst({ where: eq(products.id, source.productId) });
  if (!product || product.status === "archived") return { kind: "skipped", reason: "product archived" };

  const caption = messages.map(captionOf).find(Boolean) ?? "";
  const hash = caption ? sha256(caption) : null;
  if (hash === source.captionHash) return { kind: "skipped", reason: "caption unchanged" };

  const today = new Date().toISOString().slice(0, 10);
  const countToday = source.extractDay === today ? source.extractCount : 0;

  if (captionSaysSold(caption)) {
    await db.transaction(async (tx) => {
      await tx.update(products).set({ status: "sold", updatedAt: new Date() }).where(eq(products.id, product.id));
      await tx
        .update(productVariants)
        .set({ inventoryQty: 0, updatedAt: new Date() })
        .where(eq(productVariants.productId, product.id));
      await tx
        .update(productSources)
        .set({ captionHash: hash, updatedAt: new Date() })
        .where(eq(productSources.id, source.id));
    });
    await scheduleButtonSyncForProduct(product.id);
    return { kind: "edited", productId: product.id };
  }

  if (product.status === "sold") return { kind: "skipped", reason: "product sold" };
  if (countToday >= MAX_EXTRACTIONS_PER_POST_PER_DAY) {
    await db
      .update(products)
      .set({ rawCaption: caption || null, updatedAt: new Date() })
      .where(eq(products.id, product.id));
    return { kind: "skipped", reason: "edit limit reached" };
  }

  const settings = normalizeSettings(shop.settings);
  const extraction = await extractWithGuardrails(shop, caption, {
    defaultCurrency: shop.currency,
    hasMedia: true,
    preferredCategories: settings.sellCategories,
  });
  const listing = extraction.listing;
  if (!listing.isProduct) {
    await db
      .update(productSources)
      .set({ captionHash: hash, extractCount: countToday + 1, extractDay: today })
      .where(eq(productSources.id, source.id));
    return { kind: "skipped", reason: "edit is not a product" };
  }
  const recon = reconcileListing({
    category: listing.category,
    brand: listing.brand,
    model: listing.model,
    condition: listing.condition,
    preferredCategories: settings.sellCategories,
  });
  const priceMinor = listing.price !== null ? toMinor(listing.price) : null;
  const promote =
    product.status === "draft" &&
    settings.ingestMode === "auto_publish" &&
    !extraction.limited &&
    priceMinor !== null &&
    listing.confidence >= settings.autoPublishMinConfidence;

  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        title: listing.title,
        description: listing.description || null,
        category: recon.category,
        brand: recon.brand,
        model: recon.model,
        condition: recon.condition,
        location: listing.location,
        attributes: recon.attributes,
        tags: listing.tags,
        isNegotiable: listing.isNegotiable,
        aiConfidence: listing.confidence.toFixed(3),
        rawCaption: caption || null,
        needsPrice: priceMinor === null && product.status === "draft",
        ...(promote ? { status: "published" as const, publishedAt: product.publishedAt ?? new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
    if (priceMinor !== null) {
      await tx
        .update(productVariants)
        .set({
          priceMinor,
          compareAtMinor: listing.compareAtPrice !== null ? toMinor(listing.compareAtPrice) : null,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.productId, product.id));
    }
    await tx
      .update(productSources)
      .set({ captionHash: hash, extractCount: countToday + 1, extractDay: today, updatedAt: new Date() })
      .where(eq(productSources.id, source.id));
  });
  await scheduleButtonSyncForProduct(product.id);
  return { kind: "edited", productId: product.id };
}

async function scheduleButtonSyncForProduct(productId: string) {
  const rows = await db
    .select({ id: productSources.id })
    .from(productSources)
    .where(eq(productSources.productId, productId));
  await scheduleButtonSync(rows.map((r) => r.id));
}
