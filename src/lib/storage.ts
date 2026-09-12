import "server-only";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

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

function r2Configured() {
  return Boolean(
    serverEnv.S3_ENDPOINT &&
      serverEnv.S3_BUCKET &&
      serverEnv.S3_ACCESS_KEY_ID &&
      serverEnv.S3_SECRET_ACCESS_KEY &&
      serverEnv.S3_PUBLIC_URL,
  );
}

function mediaWorkerConfigured() {
  return Boolean(
    serverEnv.MEDIA_UPLOAD_URL &&
      serverEnv.MEDIA_UPLOAD_SECRET &&
      serverEnv.S3_PUBLIC_URL,
  );
}

function cloudConfigured() {
  return mediaWorkerConfigured() || r2Configured();
}

let s3Client: S3Client | null = null;

function getS3() {
  if (!r2Configured()) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: serverEnv.S3_ENDPOINT,
      credentials: {
        accessKeyId: serverEnv.S3_ACCESS_KEY_ID,
        secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function publicUrlForKey(key: string) {
  const base = serverEnv.S3_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/${key}`;
}

function keyFromStoredUrl(url: string): string | null {
  if (url.startsWith("/api/media/file/")) {
    return url.replace("/api/media/file/", "");
  }
  const base = serverEnv.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (base && url.startsWith(`${base}/`)) {
    return url.slice(base.length + 1);
  }
  return null;
}

async function putViaWorker(key: string, body: Buffer, contentType: string) {
  if (!mediaWorkerConfigured()) return null;
  const base = serverEnv.MEDIA_UPLOAD_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/${key}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serverEnv.MEDIA_UPLOAD_SECRET}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 worker upload failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { key?: string; url?: string };
  return {
    key: data.key ?? key,
    url: data.url ?? publicUrlForKey(key),
  };
}

async function deleteViaWorker(key: string) {
  if (!mediaWorkerConfigured()) return false;
  const base = serverEnv.MEDIA_UPLOAD_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serverEnv.MEDIA_UPLOAD_SECRET}`,
    },
  });
  return res.ok || res.status === 404;
}

async function putObject(key: string, body: Buffer, contentType: string) {
  const viaWorker = await putViaWorker(key, body, contentType);
  if (viaWorker) return viaWorker;

  const client = getS3();
  if (!client) return null;
  await client.send(
    new PutObjectCommand({
      Bucket: serverEnv.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return { key, url: publicUrlForKey(key) };
}

async function putLocal(key: string, body: Buffer) {
  // Local-filesystem uploads are a dev convenience only. In production (Vercel
  // etc.) the FS is read-only/ephemeral, so writing here would silently EROFS
  // and the file would vanish across instances. Require cloud storage there.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Media storage not configured: set S3/R2 or MEDIA_UPLOAD_* env vars. " +
        "Local filesystem uploads are unavailable in production.",
    );
  }
  const abs = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return {
    key,
    url: `/api/media/file/${key}`,
  };
}

async function saveBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const remote = await putObject(key, body, contentType);
  if (remote) return remote;
  return putLocal(key, body);
}

/** Product image — R2 when configured, else local uploads/. */
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
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveBuffer(key, buffer, file.type || "image/jpeg");
}

export async function deleteLocalProductImage(url: string | null | undefined) {
  if (!url) return;
  const key = keyFromStoredUrl(url);
  if (!key || key.includes("..") || path.isAbsolute(key)) return;

  if (url.startsWith("http")) {
    if (await deleteViaWorker(key)) return;
    const client = getS3();
    if (client) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: serverEnv.S3_BUCKET,
            Key: key,
          }),
        );
      } catch {
        // ignore missing
      }
      return;
    }
  }

  if (!url.startsWith("/api/media/file/")) return;
  const abs = path.join(UPLOAD_ROOT, key);
  try {
    await unlink(abs);
  } catch {
    // ignore missing
  }
}

/** Shop logo — R2 when configured, else local. */
export async function saveLocalShopLogo(
  shopId: string,
  input: { buffer: Buffer; mime: string },
): Promise<{ key: string; url: string }> {
  const mimeRaw =
    input.mime.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
  const mime = ALLOWED.has(mimeRaw) ? mimeRaw : "image/jpeg";
  if (input.buffer.length === 0 || input.buffer.length > MAX_BYTES) {
    throw new Error(uploadLimitsMessage());
  }

  const id = randomUUID();
  const ext = extFor(mime);
  const key = `shops/${shopId}/logo-${id}.${ext}`;
  return saveBuffer(key, input.buffer, mime);
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

/** Chat attachment — R2 when configured, else local. */
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
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveBuffer(key, buffer, file.type || "image/jpeg");
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

export function isCloudStorageEnabled() {
  return cloudConfigured();
}
