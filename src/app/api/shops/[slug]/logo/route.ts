import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import { listChannelsForShop } from "@/lib/channels";
import {
  deleteLocalProductImage,
  saveLocalShopLogoFromFile,
  uploadLimitsMessage,
} from "@/lib/storage";
import { syncShopLogoFromTelegramChat } from "@/lib/shop-logo";
import {
  getOwnedShopBySlug,
  normalizeShopSettings,
  serializeShop,
  updateShop,
} from "@/lib/shops";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const sync = url.searchParams.get("sync") === "1";

    if (sync) {
      const channels = await listChannelsForShop(shop.id);
      const channel = channels[0];
      if (!channel) {
        return NextResponse.json(
          { error: "Connect a Telegram channel first" },
          { status: 400 },
        );
      }
      const updated = await syncShopLogoFromTelegramChat({
        shop,
        telegramChatId: channel.telegramChatId,
        channelUsername: channel.username,
        force: true,
      });
      return jsonOk({ shop: serializeShop(updated) });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const settings = normalizeShopSettings(shop.settings);
    const saved = await saveLocalShopLogoFromFile(shop.id, file);
    if (settings.logoUrl) {
      await deleteLocalProductImage(settings.logoUrl);
    }

    const updated = await updateShop(shop.id, {
      settings: {
        logoUrl: saved.url,
        logoSource: "upload",
      },
    });

    return jsonOk({ shop: serializeShop(updated) });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    if (error instanceof Error && error.message === uploadLimitsMessage()) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const settings = normalizeShopSettings(shop.settings);
    if (settings.logoUrl) {
      await deleteLocalProductImage(settings.logoUrl);
    }

    const updated = await updateShop(shop.id, {
      settings: {
        logoUrl: null,
        logoSource: null,
      },
    });

    return jsonOk({ shop: serializeShop(updated) });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
