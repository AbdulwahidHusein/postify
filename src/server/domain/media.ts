import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { productImages, products } from "@/server/db/schema";
import { requireBotToken } from "@/server/env";
import { log } from "@/server/log";
import { makeRenditions } from "@/server/services/images";
import { IMAGE_WIDTHS, JPEG_KEY_SUFFIX, getObject, putObject, renditionKey } from "@/server/services/storage";
import type { TelegramPhotoSize } from "@/server/db/schema";
import sharp from "sharp";
import { RetryLater, classifyTelegramError, tg } from "@/server/services/telegram";

const MAX_ATTEMPTS = 6;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // Bot API getFile limit

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const file = await tg().getFile(fileId);
  if (!file.file_path) throw new Error("Telegram returned no file_path");
  if (file.file_size && file.file_size > MAX_DOWNLOAD_BYTES) throw new Error("File too large");
  const res = await fetch(`https://api.telegram.org/file/bot${requireBotToken()}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new RetryLater(`Telegram file download failed (${res.status})`, 15);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * For each width we serve, pick the smallest Telegram size at least that
 * wide (or the largest available). Telegram already made these JPEGs, so
 * channel photos cost a download, not CPU time.
 */
export function pickTelegramSizes(sizes: TelegramPhotoSize[]) {
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  const largest = sorted[sorted.length - 1];
  return IMAGE_WIDTHS.map((w) => ({ width: w, size: sorted.find((s) => s.width >= w) ?? largest }));
}

async function dominantColor(buf: Buffer): Promise<string | null> {
  try {
    const { dominant } = await sharp(buf).stats();
    return `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

async function copyTelegramSizes(img: { id: string; shopId: string; productId: string }, sizes: TelegramPhotoSize[]) {
  const plan = pickTelegramSizes(sizes);
  const base = `shops/${img.shopId}/products/${img.productId}/${img.id}`;
  const downloaded = new Map<string, Buffer>();
  for (const { size } of plan) {
    if (!downloaded.has(size.fileId)) downloaded.set(size.fileId, await downloadTelegramFile(size.fileId));
  }
  for (const { width, size } of plan) {
    await putObject(renditionKey(`${base}${JPEG_KEY_SUFFIX}`, width), downloaded.get(size.fileId)!, "image/jpeg", "public");
  }
  const largest = plan[plan.length - 1].size;
  // Colour placeholder from the smallest file Telegram gave us (cheap).
  const smallest = [...sizes].sort((a, b) => a.width - b.width)[0];
  const thumb = downloaded.get(smallest.fileId) ?? downloaded.get(plan[0].size.fileId)!;
  return { storageKey: `${base}${JPEG_KEY_SUFFIX}`, width: largest.width, height: largest.height, dominantColor: await dominantColor(thumb) };
}

/**
 * Store an image's renditions in R2. Telegram photos are copied in the sizes
 * Telegram already produced; seller uploads are rendered to WebP once. Idempotent: a ready
 * image is skipped, and keys are deterministic per image id.
 */
export async function processImage(imageId: string): Promise<"ready" | "skipped" | "failed"> {
  const img = await db.query.productImages.findFirst({ where: eq(productImages.id, imageId) });
  if (!img || img.status === "ready") return "skipped";

  await db
    .update(productImages)
    .set({ attempts: sql`${productImages.attempts} + 1`, updatedAt: new Date() })
    .where(eq(productImages.id, imageId));

  try {
    if (img.telegramSizes?.length) {
      const out = await copyTelegramSizes(img, img.telegramSizes);
      await db
        .update(productImages)
        .set({ status: "ready", ...out, updatedAt: new Date() })
        .where(eq(productImages.id, imageId));
      await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, img.productId));
      return "ready";
    }
    let original: Buffer;
    if (img.telegramFileId) {
      original = await downloadTelegramFile(img.telegramFileId);
    } else if (img.originalKey) {
      original = await getObject(img.originalKey, "private");
    } else {
      throw new Error("Image has no source");
    }

    const out = await makeRenditions(original);
    const storageKey = `shops/${img.shopId}/products/${img.productId}/${img.id}`;
    for (const f of out.files) {
      await putObject(renditionKey(storageKey, f.width), f.body, "image/webp", "public");
    }
    await db
      .update(productImages)
      .set({
        status: "ready",
        storageKey,
        width: out.width,
        height: out.height,
        dominantColor: out.dominantColor,
        updatedAt: new Date(),
      })
      .where(eq(productImages.id, imageId));
    // Touch the product so storefront caches revalidate with the new image.
    await db
      .update(products)
      .set({ updatedAt: new Date() })
      .where(and(eq(products.id, img.productId)));
    return "ready";
  } catch (err) {
    const c = classifyTelegramError(err);
    const permanent =
      !(err instanceof RetryLater) &&
      (c.kind === "bad_request" || (err instanceof Error && /unsupported image|unreadable|too large|input buffer/i.test(err.message)));
    if (permanent || img.attempts + 1 >= MAX_ATTEMPTS) {
      log.warn("image failed permanently", { image_id: imageId, err });
      await db
        .update(productImages)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(productImages.id, imageId));
      return "failed";
    }
    if (err instanceof RetryLater) throw err;
    throw new RetryLater(c.description, c.retryAfter ?? 15);
  }
}
