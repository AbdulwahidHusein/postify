import { z } from "zod";
import { json, readJson, route, AppError } from "@/server/http";
import { setSessionCookie } from "@/server/auth/session";
import { verifyMiniAppInitData } from "@/server/auth/telegram";
import { serializeUser, upsertTelegramUser } from "@/server/auth/users";

const body = z.object({ initData: z.string().min(1).max(8192) });

export const POST = route(async (request) => {
  const { initData } = await readJson(request, body.parse);
  let identity;
  try {
    identity = verifyMiniAppInitData(initData);
  } catch {
    throw new AppError("Telegram sign-in could not be verified. Reopen the app from Telegram.", 401, "invalid_init_data");
  }
  const user = await upsertTelegramUser(identity);
  await setSessionCookie({ userId: user.id, telegramId: user.telegramId.toString() });
  return json({ user: serializeUser(user) });
});
