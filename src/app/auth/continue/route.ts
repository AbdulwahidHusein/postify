import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getOrCreateProductConversation,
} from "@/lib/chat";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

/**
 * After Telegram login from "Sign in to message", land here then jump into the thread.
 */
export async function GET(request: Request) {
  const appUrl = serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const productId = url.searchParams.get("message");

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(`${appUrl}/dashboard?auth=expired`);
  }

  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return NextResponse.redirect(`${appUrl}/inbox`);
  }

  try {
    const { conversation } = await getOrCreateProductConversation({
      productId,
      buyerUserId: session.userId,
    });
    return NextResponse.redirect(`${appUrl}/inbox/${conversation.id}`);
  } catch {
    // Product gone / own listing / etc. — soft landing on product if we can.
    return NextResponse.redirect(`${appUrl}/inbox`);
  }
}
