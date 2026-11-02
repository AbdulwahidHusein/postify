import "server-only";

import { authorize, type Action, type ShopAccess } from "@/server/auth/authorize";
import { route } from "@/server/http";

type Params = Record<string, string>;

/**
 * Route handler for /api/shops/[shop]/... : authenticates the session,
 * resolves the shop by handle and checks the role may perform `action`.
 */
export function shopRoute<P extends Params = { shop: string }>(
  action: Action,
  handler: (request: Request, access: ShopAccess, params: P) => Promise<Response>,
) {
  return route<{ params: Promise<P & { shop: string }> }>(async (request, ctx) => {
    const params = await ctx.params;
    const access = await authorize(params.shop, action);
    return handler(request, access, params);
  });
}

export function searchParams(request: Request) {
  return new URL(request.url).searchParams;
}
