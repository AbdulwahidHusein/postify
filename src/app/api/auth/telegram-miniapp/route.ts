import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyMiniAppInitData } from "@/lib/auth/telegram";
import { serializeUser, upsertTelegramUser } from "@/lib/auth/users";

const bodySchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const identity = verifyMiniAppInitData(body.initData);
    const user = await upsertTelegramUser(identity);
    await setSessionCookie({
      userId: user.id,
      telegramId: user.telegramId.toString(),
    });
    return jsonOk({ user: serializeUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
