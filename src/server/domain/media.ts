import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { productImages, products } from "@/server/db/schema";
import { requireBotToken } from "@/server/env";
import { log } from "@/server/log";
import { makeRenditions } from "@/server/services/images";
import { getObject, putObject, renditionKey } from "@/server/services/storage";
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
 * Download once, render WebP sizes once, store in R2. Idempotent: a ready
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
