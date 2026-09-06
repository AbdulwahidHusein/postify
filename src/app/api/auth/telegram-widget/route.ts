import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyLoginWidget } from "@/lib/auth/telegram";
import { serializeUser, upsertTelegramUser } from "@/lib/auth/users";

const bodySchema = z.object({
  id: z.union([z.number(), z.string()]),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const identity = verifyLoginWidget(body);
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
