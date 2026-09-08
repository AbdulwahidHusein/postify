import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  ChatError,
  countSellerUnread,
  listSellerInbox,
  serializeConversation,
} from "@/lib/chat";
import { getOwnedShopBySlug } from "@/lib/shops";

type Props = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const productId = url.searchParams.get("productId");

    const [rows, unread] = await Promise.all([
      listSellerInbox({
        shopId: shop.id,
        ownerUserId: session.userId,
        unreadOnly,
        productId,
      }),
      countSellerUnread(shop.id),
    ]);

    return jsonOk({
      conversations: rows.map((c) => serializeConversation(c, "seller")),
      unreadTotal: unread,
    });
  } catch (error) {
    if (error instanceof ChatError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
