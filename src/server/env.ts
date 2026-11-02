import "server-only";

import { z } from "zod";

/**
 * Server configuration. Everything optional has a safe default so local dev
 * and tests run without cloud credentials; production deploys set the rest.
 */
const schema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  /** e.g. ".goods.et" so the session works on shop subdomains */
  COOKIE_DOMAIN: z.string().default(""),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /** Root domain for shop subdomains, e.g. "goods.et" */
  ROOT_DOMAIN: z.string().default("localhost:3000"),

  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_BOT_USERNAME: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  TELEGRAM_MINI_APP_SHORT_NAME: z.string().default(""),
  /** Private chat or channel id that receives ops alerts. */
  OPS_TELEGRAM_CHAT_ID: z.string().default(""),

  /** AI: API key mode (dev) or Vertex AI with the service account (prod). */
  GEMINI_API_KEY: z.string().default(""),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("gemini-2.5-flash"),
  GOOGLE_CLOUD_PROJECT: z.string().default(""),
  GOOGLE_CLOUD_LOCATION: z.string().default("europe-west1"),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(3),
  AI_SHOP_DAILY_QUOTA: z.coerce.number().int().min(0).default(100),
  AI_NEW_SHOP_DAILY_QUOTA: z.coerce.number().int().min(0).default(20),
  /** USD per 1M tokens, for cost estimates in ai_usage. */
  AI_PRICE_INPUT_PER_M: z.coerce.number().min(0).default(0.3),
  AI_PRICE_OUTPUT_PER_M: z.coerce.number().min(0).default(2.5),

  /**
   * Background jobs: "db" = Postgres queue drained after each response and by
   * the cron sweep (Vercel), "cloud" = Cloud Tasks (Cloud Run), "inline" =
   * in-process timers (local dev and tests only).
   */
  TASKS_MODE: z.enum(["db", "cloud", "inline"]).default("inline"),
  /** Shared secret for /internal/cron/* (Vercel Cron and the GitHub schedule send it as a Bearer token). */
  CRON_SECRET: z.string().default(""),
  /** Serve shops on <handle>.ROOT_DOMAIN (needs a wildcard domain). Off: /s/<handle>. */
  SHOP_SUBDOMAINS: z
    .enum(["true", "false", "1", "0", ""])
    .default("")
    .transform((v) => v === "true" || v === "1"),
  TASKS_PROJECT: z.string().default(""),
  TASKS_LOCATION: z.string().default("europe-west1"),
  /** Base URL Cloud Tasks calls, e.g. the private jobs service URL. */
  TASKS_TARGET_URL: z.string().default(""),
  /** Service account Cloud Tasks / Scheduler sign OIDC tokens as. */
  TASKS_SERVICE_ACCOUNT: z.string().default(""),
  /** Audience expected on OIDC tokens (defaults to TASKS_TARGET_URL). */
  TASKS_AUDIENCE: z.string().default(""),
  /** Dev-only shared secret for /internal/* when not on Google Cloud. */
  INTERNAL_DEV_SECRET: z.string().default(""),

  /** Media: R2 via S3 API. Empty = local filesystem (dev only). */
  S3_ENDPOINT: z.string().default(""),
  S3_BUCKET: z.string().default(""),
  S3_PRIVATE_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  /** Public image base, e.g. https://img.goods.et */
  MEDIA_PUBLIC_URL: z.string().default(""),
  /** Legacy alias for MEDIA_PUBLIC_URL (older Postify deploys). */
  S3_PUBLIC_URL: z.string().default(""),
  /**
   * Optional Cloudflare Worker that writes to R2 (Bearer secret). Used when
   * S3 access keys are not set — same path the original Postify upload used.
   */
  MEDIA_UPLOAD_URL: z.string().default(""),
  MEDIA_UPLOAD_SECRET: z.string().default(""),

  /** Cloudflare API for cache purge (optional). */
  CLOUDFLARE_API_TOKEN: z.string().default(""),
  CLOUDFLARE_ZONE_ID: z.string().default(""),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${msg}`);
  }
  const data = parsed.data;
  if (!data.MEDIA_PUBLIC_URL && data.S3_PUBLIC_URL) {
    data.MEDIA_PUBLIC_URL = data.S3_PUBLIC_URL;
  }
  return data;
}

export const serverEnv = load();

export const isProduction = serverEnv.NODE_ENV === "production";

export function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

export function requireBotToken() {
  if (!serverEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return serverEnv.TELEGRAM_BOT_TOKEN;
}

export function botUsername() {
  return serverEnv.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
}

export function getLlmApiKey() {
  return serverEnv.GEMINI_API_KEY || serverEnv.LLM_API_KEY || "";
}
