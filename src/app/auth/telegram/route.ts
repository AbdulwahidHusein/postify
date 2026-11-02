import { NextResponse } from "next/server";
import { consumeLoginToken } from "@/server/auth/login-tokens";
import { setSessionCookie } from "@/server/auth/session";
import { getUserById } from "@/server/auth/users";
import { appUrl } from "@/server/env";

export const dynamic = "force-dynamic";

/** One-time sign-in link sent by the bot (/start auth). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${appUrl()}/login?error=missing`);
  const consumed = await consumeLoginToken(token);
  const user = consumed ? await getUserById(consumed.userId) : null;
  if (!consumed || !user) return NextResponse.redirect(`${appUrl()}/login?error=expired`);
  await setSessionCookie({ userId: user.id, telegramId: user.telegramId.toString() });
  return NextResponse.redirect(`${appUrl()}${consumed.redirectPath}`);
}
