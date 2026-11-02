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
import { isProduction, serverEnv } from "@/server/env";

/**
 * Object storage: Cloudflare R2 through the S3 API in production, the local
 * filesystem in development. Public renditions live in S3_BUCKET (served from
 * MEDIA_PUBLIC_URL); originals and chat images live in S3_PRIVATE_BUCKET.
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
  if (isProduction && !cloudStorageEnabled()) {
    throw new Error("Object storage is not configured (S3_* env vars are required in production)");
  }
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
  await rm(localPath(visibility, key), { force: true });
}

/** Public URL of a public object (renditions, logos, banners). */
export function publicUrl(key: string): string {
  if (serverEnv.MEDIA_PUBLIC_URL) return `${serverEnv.MEDIA_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `/api/media/file/${key}`;
}

export function renditionKey(storageKey: string, width: ImageWidth) {
  return `${storageKey}-${width}.webp`;
}

export function imageUrl(storageKey: string, width: ImageWidth = 800): string {
  return publicUrl(renditionKey(storageKey, width));
}

// ── direct browser uploads ─────────────────────────────────────────────────
const UPLOAD_TTL_SECONDS = 600;

function localUploadSignature(key: string, contentType: string, expires: number) {
  return createHmac("sha256", serverEnv.SESSION_SECRET)
    .update(`${key}\n${contentType}\n${expires}`)
    .digest("hex");
}

/**
 * Presigned PUT the browser uploads to directly, so image bytes never pass
 * through Cloud Run. Originals go to the private bucket.
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

/** Dev-only counterpart of presignUpload. */
export function verifyLocalUpload(params: URLSearchParams): { key: string; contentType: string } | null {
  if (isProduction) return null;
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
  if (cloudStorageEnabled()) return null;
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
  return `/api/media/private/${key}`;
}

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
