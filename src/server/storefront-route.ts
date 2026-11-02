import "server-only";

import type { Shop } from "@/server/db/schema";
import { notFound, route } from "@/server/http";
import { resolveStorefrontShop } from "@/server/domain/storefront";

/** Public storefront API: resolves /api/storefront/[shop]/... to an active shop. */
export function storefrontRoute(handler: (request: Request, shop: Shop) => Promise<Response>) {
  return route<{ params: Promise<{ shop: string }> }>(async (request, ctx) => {
    const shop = await resolveStorefrontShop((await ctx.params).shop);
    if (!shop) throw notFound("Shop not found");
    return handler(request, shop);
  });
}
