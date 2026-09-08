import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import { getProductById, serializeProduct } from "@/lib/products";
import { postProductToConnectedChannel } from "@/lib/post-product-to-channel";
import { getOwnedShop } from "@/lib/shops";
import { telegramMessageUrl } from "@/lib/telegram-links";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const product = await getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const shop = await getOwnedShop(product.shopId, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await postProductToConnectedChannel(id);
    if (!updated) {
      return NextResponse.json({ error: "Post failed" }, { status: 500 });
    }

    const telegramUrl = telegramMessageUrl({
      username: updated.channel?.username,
      chatId: updated.sourceChatId,
      messageId: updated.sourceMessageId,
    });

    return jsonOk({
      product: serializeProduct(updated),
      telegramUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    const message =
      error instanceof Error ? error.message : "Could not post to Telegram";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
