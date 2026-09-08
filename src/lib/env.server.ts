import "server-only";

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  TELEGRAM_MINI_APP_SHORT_NAME: z.string().optional().default("shop"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  GEMINI_API_KEY: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().optional().default("gemini-2.5-flash"),
  CRON_SECRET: z.string().optional().default(""),
});

export const serverEnv = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_MINI_APP_SHORT_NAME: process.env.TELEGRAM_MINI_APP_SHORT_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
  CRON_SECRET: process.env.CRON_SECRET,
});

export function requireBotToken() {
  if (!serverEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return serverEnv.TELEGRAM_BOT_TOKEN;
}

/** Gemini / LLM key — GEMINI_API_KEY preferred, LLM_API_KEY accepted. */
export function getLlmApiKey() {
  return serverEnv.GEMINI_API_KEY || serverEnv.LLM_API_KEY || "";
}
