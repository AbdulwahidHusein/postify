import { z } from "zod";
import { json, readJson, route, AppError } from "@/server/http";
import { setSessionCookie } from "@/server/auth/session";
import { verifyLoginWidget } from "@/server/auth/telegram";
import { serializeUser, upsertTelegramUser } from "@/server/auth/users";

const body = z.record(z.string(), z.union([z.string(), z.number()]));

export const POST = route(async (request) => {
  const payload = await readJson(request, body.parse);
  let identity;
  try {
    identity = verifyLoginWidget(payload as never);
  } catch {
    throw new AppError("Telegram sign-in could not be verified", 401, "invalid_widget");
  }
  const user = await upsertTelegramUser(identity);
  await setSessionCookie({ userId: user.id, telegramId: user.telegramId.toString() });
  return json({ user: serializeUser(user) });
});
