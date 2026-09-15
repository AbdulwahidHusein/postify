import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { disconnectChannel } from "@/lib/channels";
import { getOwnedShopBySlug } from "@/lib/shops";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const shopSlug = url.searchParams.get("shopSlug");

    if (!shopSlug) {
      return NextResponse.json(
        { error: "shopSlug is required" },
        { status: 400 },
      );
    }

    const shop = await getOwnedShopBySlug(shopSlug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    await disconnectChannel({ shopId: shop.id, ownerUserId: session.userId });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
