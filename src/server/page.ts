import "server-only";

import { headers, cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { authorize, type Action, type ShopAccess } from "@/server/auth/authorize";
import { AuthError } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { resolveStorefrontShop } from "@/server/domain/storefront";
import { asLocale, type Locale } from "@/i18n";
import type { Shop } from "@/server/db/schema";

/** Dashboard page guard: sign-in redirect, 404 for non-members. */
export async function requireShopPage(handle: string, action: Action, nextPath: string): Promise<ShopAccess> {
  try {
    return await authorize(handle, action);
  } catch (err) {
    if (err instanceof AuthError) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    if (err instanceof AppError && err.status === 403) redirect(`/dashboard/${handle}`);
    notFound();
  }
}

export type Storefront = { shop: Shop; base: string; locale: Locale };

/** Storefront page context: the shop, the URL base for links, and the language. */
export async function getStorefront(param: string): Promise<Storefront> {
  const shop = await resolveStorefrontShop(param);
  if (!shop) notFound();
  const h = await headers();
  const base = h.get("x-goods-base") ?? `/s/${shop.handle}`;
  const jar = await cookies();
  const locale = asLocale(jar.get("goods_lang")?.value ?? shop.locale);
  return { shop, base, locale };
}

export const PREVIEW_COOKIE = "goods_store_preview";

/**
 * The design a storefront request should render: the seller's draft inside
 * the customizer's preview frame (?goods_preview, flagged by the proxy, plus the
 * signed preview cookie), otherwise the published design. Cached per request
 * so layout and page agree.
 */
export const storeDesign = cache(async (shop: Shop) => {
  const { draftDesign, previewAllowed, publishedDesign } = await import("@/server/domain/store-design");
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const asked = h.get("x-goods-preview") === "1";
  const preview = asked && (await previewAllowed(shop.id, jar.get(PREVIEW_COOKIE)?.value));
  return { design: preview ? draftDesign(shop).design : publishedDesign(shop), preview };
});
