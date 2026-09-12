import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyMiniAppInitData } from "@/lib/auth/telegram";
import { serializeUser, upsertTelegramUser } from "@/lib/auth/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const rl = rateLimit({
      key: `auth:miniapp:${clientIp(request)}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

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
