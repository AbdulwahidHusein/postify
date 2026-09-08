import { NextResponse } from "next/server";
import { consumeLoginToken } from "@/lib/auth/login-tokens";
import { setSessionCookie } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const appUrl = serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  if (!token) {
    return NextResponse.redirect(`${appUrl}/dashboard?auth=missing`);
  }

  const consumed = await consumeLoginToken(token);
  if (!consumed) {
    return NextResponse.redirect(`${appUrl}/dashboard?auth=expired`);
  }

  const user = await getUserById(consumed.userId);
  if (!user) {
    return NextResponse.redirect(`${appUrl}/dashboard?auth=expired`);
  }

  await setSessionCookie({
    userId: user.id,
    telegramId: user.telegramId.toString(),
  });

  const next = consumed.redirectPath.startsWith("/")
    ? consumed.redirectPath
    : "/dashboard?auth=ok";

  return NextResponse.redirect(`${appUrl}${next}`);
}
