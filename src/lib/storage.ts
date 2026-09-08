import "server-only";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function extFor(mime: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export function isAllowedImage(file: File) {
  return ALLOWED.has(file.type) && file.size > 0 && file.size <= MAX_BYTES;
}

export function uploadLimitsMessage() {
  return "Use JPG, PNG, WebP, or GIF up to 8MB.";
}

/** Saves file under uploads/products/{productId}/ and returns public API URL. */
export async function saveLocalProductImage(
  productId: string,
  file: File,
): Promise<{ key: string; url: string }> {
  if (!isAllowedImage(file)) {
    throw new Error(uploadLimitsMessage());
  }

  const id = randomUUID();
  const ext = extFor(file.type);
  const key = `products/${productId}/${id}.${ext}`;
  const abs = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buffer);

  return {
    key,
    url: `/api/media/file/${key}`,
  };
}

export async function deleteLocalProductImage(url: string | null | undefined) {
  if (!url?.startsWith("/api/media/file/")) return;
  const key = url.replace("/api/media/file/", "");
  if (key.includes("..") || path.isAbsolute(key)) return;
  const abs = path.join(UPLOAD_ROOT, key);
  try {
    await unlink(abs);
  } catch {
    // ignore missing
  }
}

/** Saves shop logo under uploads/shops/{shopId}/ and returns public API URL. */
export async function saveLocalShopLogo(
  shopId: string,
  input: { buffer: Buffer; mime: string },
): Promise<{ key: string; url: string }> {
  const mimeRaw = input.mime.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
  const mime = ALLOWED.has(mimeRaw) ? mimeRaw : "image/jpeg";
  if (input.buffer.length === 0 || input.buffer.length > MAX_BYTES) {
    throw new Error(uploadLimitsMessage());
  }

  const id = randomUUID();
  const ext = extFor(mime);
  const key = `shops/${shopId}/logo-${id}.${ext}`;
  const abs = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.buffer);

  return {
    key,
    url: `/api/media/file/${key}`,
  };
}

export async function saveLocalShopLogoFromFile(
  shopId: string,
  file: File,
): Promise<{ key: string; url: string }> {
  if (!isAllowedImage(file)) {
    throw new Error(uploadLimitsMessage());
  }
  return saveLocalShopLogo(shopId, {
    buffer: Buffer.from(await file.arrayBuffer()),
    mime: file.type,
  });
}

/** Chat attachment under uploads/chat/{conversationId}/ */
export async function saveLocalChatImage(
  conversationId: string,
  file: File,
): Promise<{ key: string; url: string }> {
  if (!isAllowedImage(file)) {
    throw new Error(uploadLimitsMessage());
  }

  const id = randomUUID();
  const ext = extFor(file.type);
  const key = `chat/${conversationId}/${id}.${ext}`;
  const abs = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buffer);

  return {
    key,
    url: `/api/media/file/${key}`,
  };
}

export function resolveUploadPath(key: string) {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.includes("..")) {
    throw new Error("Invalid path");
  }
  const abs = path.join(UPLOAD_ROOT, normalized);
  if (!abs.startsWith(UPLOAD_ROOT)) {
    throw new Error("Invalid path");
  }
  return abs;
}
