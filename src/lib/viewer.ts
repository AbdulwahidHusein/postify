import "server-only";

import { getSession } from "@/lib/auth/session";
import {
  getOwnedShop,
  getOwnedShopBySlug,
  listShopsForOwner,
} from "@/lib/shops";

/**
 * How the current viewer relates to a public shop.
 * There is no separate “buyer role” in the DB — buyers are guests or signed-in
 * users who do not own *this* shop.
 */
export type ShopViewer =
  | { kind: "guest" }
  | { kind: "signed_in"; hasAnyShop: boolean }
  | {
      kind: "owner";
      shopSlug: string;
      shopName: string;
      shopId: string;
    };

export async function resolveShopViewer(input: {
  shopId: string;
  shopSlug: string;
  shopName: string;
}): Promise<ShopViewer> {
  const session = await getSession();
  if (!session) return { kind: "guest" };

  const ownedHere = await getOwnedShop(input.shopId, session.userId);
  if (ownedHere) {
    return {
      kind: "owner",
      shopSlug: input.shopSlug,
      shopName: input.shopName,
      shopId: ownedHere.id,
    };
  }

  const shops = await listShopsForOwner(session.userId);
  return { kind: "signed_in", hasAnyShop: shops.length > 0 };
}

export async function resolveShopViewerBySlug(
  slug: string,
): Promise<{ viewer: ShopViewer; owned: boolean }> {
  const session = await getSession();
  if (!session) return { viewer: { kind: "guest" }, owned: false };

  const owned = await getOwnedShopBySlug(slug, session.userId);
  if (owned) {
    return {
      owned: true,
      viewer: {
        kind: "owner",
        shopSlug: owned.slug,
        shopName: owned.name,
        shopId: owned.id,
      },
    };
  }

  const shops = await listShopsForOwner(session.userId);
  return {
    owned: false,
    viewer: { kind: "signed_in", hasAnyShop: shops.length > 0 },
  };
}
