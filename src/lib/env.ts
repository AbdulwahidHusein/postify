import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Postify"),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
});

export const appName = publicEnv.NEXT_PUBLIC_APP_NAME;
export const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
export const telegramBotUsername =
  publicEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.replace(/^@/, "");
