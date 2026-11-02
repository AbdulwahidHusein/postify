import { randomBytes, createHash } from "node:crypto";

/**
 * UUIDv7 (RFC 9562): 48-bit unix ms timestamp + random bits.
 * Time-ordered, so primary-key indexes stay append-mostly.
 */
export function uuidv7(now = Date.now()): string {
  const bytes = randomBytes(16);
  const ts = BigInt(now);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Short opaque public code (base62). 10 chars ≈ 59 bits — safe for URLs and
 * Telegram startapp payloads, which only allow [A-Za-z0-9_-].
 */
export function shortCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % 62];
  return out;
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL slug stem: lowercase ascii, hyphens, max 48 chars. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
