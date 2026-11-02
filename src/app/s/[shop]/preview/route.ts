import { NextResponse } from "next/server";
import { resolveStorefrontShop } from "@/server/domain/storefront";
import { previewAllowed } from "@/server/domain/store-design";
import { PREVIEW_COOKIE } from "@/server/page";
import { isProduction } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Entry point for the customizer's preview frame: checks the signed token,
 * stores it in a cookie, then opens the store home in preview mode.
 */
export async function GET(request: Request, ctx: { params: Promise<{ shop: string }> }) {
  const { shop: param } = await ctx.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shop = await resolveStorefrontShop(param);
  if (!shop || !(await previewAllowed(shop.id, token))) return new NextResponse("Preview link expired. Reopen the editor.", { status: 403 });
  const res = NextResponse.redirect(new URL(`/s/${shop.handle}?goods_preview=1`, url));
  res.cookies.set(PREVIEW_COOKIE, token!, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge: 60 * 60 * 12 });
  return res;
}
