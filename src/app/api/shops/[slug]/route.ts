import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  getOwnedShopBySlug,
  getShopBySlug,
  normalizeTelegramChannel,
  serializeShop,
  updateShop,
} from "@/lib/shops";
import { countProductsByStatus } from "@/lib/products";
import { listChannelsForShop, serializeChannel } from "@/lib/channels";

type Props = {
  params: Promise<{ slug: string }>;
};

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  settings: z
    .object({
      defaultCurrency: z.string().trim().min(1).max(8).optional(),
      autoPublishMinConfidence: z.number().min(0).max(1).optional(),
      linkMode: z.enum(["reply", "bot_owned"]).optional(),
      telegramChannel: z.string().trim().max(160).nullable().optional(),
      ownerUsername: z.string().trim().max(80).nullable().optional(),
      ownerPhone: z.string().trim().max(32).nullable().optional(),
      sellCategories: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
      ingestMode: z.enum(["auto_publish", "always_draft", "paused"]).optional(),
      shopVisible: z.boolean().optional(),
      sellerNotifyOrders: z.boolean().optional(),
      sellerNotifyMessages: z.boolean().optional(),
      autoArchiveDays: z.number().int().min(1).max(365).nullable().optional(),
    })
    .optional(),
});

export async function GET(request: Request, { params }: Props) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const owned = url.searchParams.get("owned") === "1";

    if (owned) {
      const session = await requireSession();
      const shop = await getOwnedShopBySlug(slug, session.userId);
      if (!shop) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }
      const [counts, channels] = await Promise.all([
        countProductsByStatus(shop.id),
        listChannelsForShop(shop.id),
      ]);
      return jsonOk({
        shop: serializeShop(shop),
        counts,
        channels: channels.map(serializeChannel),
      });
    }

    const shop = await getShopBySlug(slug);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    return jsonOk({ shop: serializeShop(shop) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const body = patchSchema.parse(await request.json());
    const settings = body.settings
      ? {
          ...body.settings,
          telegramChannel:
            body.settings.telegramChannel === undefined
              ? undefined
              : normalizeTelegramChannel(body.settings.telegramChannel),
          ownerUsername:
            body.settings.ownerUsername === undefined
              ? undefined
              : body.settings.ownerUsername?.trim() || null,
          ownerPhone:
            body.settings.ownerPhone === undefined
              ? undefined
              : body.settings.ownerPhone?.trim() || null,
          sellCategories: body.settings.sellCategories?.map((c) => c.trim()).filter(Boolean),
        }
      : undefined;

    const updated = await updateShop(shop.id, {
      name: body.name,
      description: body.description,
      settings,
    });
    return jsonOk({ shop: serializeShop(updated) });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
