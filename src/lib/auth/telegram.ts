import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parse, validate } from "@tma.js/init-data-node";
import { z } from "zod";
import { requireBotToken } from "@/lib/env.server";

export type TelegramIdentity = {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium: boolean;
  photoUrl?: string;
};

const widgetSchema = z.object({
  id: z.union([z.number(), z.string()]),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().min(1),
});

export type TelegramWidgetPayload = z.infer<typeof widgetSchema>;

export function verifyMiniAppInitData(initData: string): TelegramIdentity {
  const token = requireBotToken();
  validate(initData, token, { expiresIn: 60 * 60 * 24 });
  const data = parse(initData);
  const user = data.user;
  if (!user) {
    throw new Error("Init data has no user");
  }

  return {
    telegramId: BigInt(user.id),
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    languageCode: user.language_code,
    isPremium: Boolean(user.is_premium),
    photoUrl: user.photo_url,
  };
}

/**
 * Telegram Login Widget uses a different HMAC scheme than Mini App initData.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyLoginWidget(
  input: TelegramWidgetPayload,
): TelegramIdentity {
  const payload = widgetSchema.parse(input);
  const token = requireBotToken();

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new Error("Invalid auth_date");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > 60 * 60 * 24) {
    throw new Error("Login widget data expired");
  }

  const checkString = Object.entries(payload)
    .filter(([key]) => key !== "hash")
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const secretKey = createHash("sha256").update(token).digest();
  const computed = createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(payload.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid login widget signature");
  }

  return {
    telegramId: BigInt(payload.id),
    firstName: payload.first_name,
    lastName: payload.last_name,
    username: payload.username,
    languageCode: undefined,
    isPremium: false,
    photoUrl: payload.photo_url || undefined,
  };
}
