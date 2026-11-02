import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/server/http";
import { isProduction, serverEnv } from "@/server/env";

/**
 * Object storage: Cloudflare R2 through the S3 API when keys are set; otherwise
 * the legacy MEDIA_UPLOAD Worker; otherwise the local filesystem in development.
 * Public renditions live in S3_BUCKET (served from MEDIA_PUBLIC_URL).
 */

export const IMAGE_WIDTHS = [320, 800, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

export function cloudStorageEnabled() {
  return Boolean(
    serverEnv.S3_ENDPOINT &&
      serverEnv.S3_BUCKET &&
      serverEnv.S3_ACCESS_KEY_ID &&
      serverEnv.S3_SECRET_ACCESS_KEY,
  );
}

export function mediaWorkerEnabled() {
  return Boolean(serverEnv.MEDIA_UPLOAD_URL && serverEnv.MEDIA_UPLOAD_SECRET);
}

function cloudConfigured() {
  return cloudStorageEnabled() || mediaWorkerEnabled();
}

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: serverEnv.S3_ENDPOINT,
      credentials: {
        accessKeyId: serverEnv.S3_ACCESS_KEY_ID,
        secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

function bucket(visibility: "public" | "private") {
  return visibility === "private"
    ? serverEnv.S3_PRIVATE_BUCKET || serverEnv.S3_BUCKET
    : serverEnv.S3_BUCKET;
}

function assertSafeKey(key: string) {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

function localPath(visibility: "public" | "private", key: string) {
  return path.join(LOCAL_ROOT, visibility, key);
}

function requireCloudInProduction() {
  if (isProduction && !cloudConfigured()) {
    throw new AppError(
      "Image storage is not configured. Set S3 access keys, or MEDIA_UPLOAD_URL + MEDIA_UPLOAD_SECRET.",
      503,
      "storage_unconfigured",
    );
  }
}

async function putViaWorker(key: string, body: Buffer, contentType: string) {
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
    throw new Error(`Media worker upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function deleteViaWorker(key: string) {
  const base = serverEnv.MEDIA_UPLOAD_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/${key}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serverEnv.MEDIA_UPLOAD_SECRET}` },
  });
  return res.ok || res.status === 404;
}

/** When only the Worker is configured, objects live in the public R2 bucket. */
async function getViaPublicUrl(key: string): Promise<Buffer> {
  const base = (serverEnv.MEDIA_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("MEDIA_PUBLIC_URL is required when using the media worker");
  const res = await fetch(`${base}/${key}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to read object (${res.status}): ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  visibility: "public" | "private" = "public",
): Promise<void> {
  assertSafeKey(key);
  requireCloudInProduction();
  if (cloudStorageEnabled()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(visibility),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl:
          visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=0",
      }),
    );
    return;
  }
  if (mediaWorkerEnabled()) {
    await putViaWorker(key, body, contentType);
    return;
  }
  const file = localPath(visibility, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(
  key: string,
  visibility: "public" | "private" = "private",
): Promise<Buffer> {
  assertSafeKey(key);
  requireCloudInProduction();
  if (cloudStorageEnabled()) {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(visibility), Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${key}`);
    return Buffer.from(bytes);
  }
  if (mediaWorkerEnabled()) {
    return getViaPublicUrl(key);
  }
  return readFile(localPath(visibility, key));
}

export async function deleteObject(
  key: string,
  visibility: "public" | "private" = "public",
): Promise<void> {
  assertSafeKey(key);
  if (cloudStorageEnabled()) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(visibility), Key: key }));
    return;
  }
  if (mediaWorkerEnabled()) {
    await deleteViaWorker(key);
    return;
  }
  await rm(localPath(visibility, key), { force: true });
}

/** Public URL of a public object (renditions, logos, banners). */
export function publicUrl(key: string): string {
  if (serverEnv.MEDIA_PUBLIC_URL) return `${serverEnv.MEDIA_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `/api/media/file/${key}`;
}

/** Marks a storage key whose renditions are JPEGs copied from Telegram. */
export const JPEG_KEY_SUFFIX = "@jpg";

export function renditionKey(storageKey: string, width: ImageWidth) {
  if (storageKey.endsWith(JPEG_KEY_SUFFIX)) return `${storageKey.slice(0, -JPEG_KEY_SUFFIX.length)}-${width}.jpg`;
  return `${storageKey}-${width}.webp`;
}

export function imageUrl(storageKey: string, width: ImageWidth = 800): string {
  return publicUrl(renditionKey(storageKey, width));
}

// ── browser uploads (presigned S3, or signed proxy → Worker / local) ───────
const UPLOAD_TTL_SECONDS = 600;

function localUploadSignature(key: string, contentType: string, expires: number) {
  return createHmac("sha256", serverEnv.SESSION_SECRET)
    .update(`${key}\n${contentType}\n${expires}`)
    .digest("hex");
}

/**
 * Presigned PUT for the browser. Prefers R2 S3 when keys exist; otherwise a
 * signed same-origin URL that our API forwards to the media Worker (or local disk).
 */
export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  assertSafeKey(key);
  requireCloudInProduction();
  if (cloudStorageEnabled()) {
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket("private"), Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_TTL_SECONDS },
    );
    return { url, headers: { "Content-Type": contentType } };
  }
  const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
  const sig = localUploadSignature(key, contentType, expires);
  const qs = new URLSearchParams({ key, ct: contentType, exp: String(expires), sig });
  return { url: `/api/media/local-upload?${qs.toString()}`, headers: { "Content-Type": contentType } };
}

/** Verify a signed browser→API upload (local disk or media Worker proxy). */
export function verifyLocalUpload(params: URLSearchParams): { key: string; contentType: string } | null {
  // S3 path never uses this route. Worker/local both need the signed proxy.
  if (isProduction && cloudStorageEnabled()) return null;
  if (isProduction && !mediaWorkerEnabled()) return null;
  const key = params.get("key") ?? "";
  const ct = params.get("ct") ?? "";
  const exp = Number(params.get("exp") ?? "0");
  const sig = params.get("sig") ?? "";
  if (!key || !ct || !exp || exp < Date.now() / 1000) return null;
  const expected = localUploadSignature(key, ct, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { key, contentType: ct };
}

export async function readLocalPublic(key: string): Promise<Buffer | null> {
  if (cloudConfigured()) return null;
  assertSafeKey(key);
  try {
    return await readFile(localPath("public", key));
  } catch {
    return null;
  }
}

/** Short-lived signed GET for private objects (chat images). */
export async function privateUrl(key: string): Promise<string> {
  assertSafeKey(key);
  if (cloudStorageEnabled()) {
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket("private"), Key: key }), {
      expiresIn: 3600,
    });
  }
  if (mediaWorkerEnabled() && serverEnv.MEDIA_PUBLIC_URL) {
    return `${serverEnv.MEDIA_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return `/api/media/private/${key}`;
}

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
