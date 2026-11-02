import { json } from "@/server/http";
import { storefrontRoute } from "@/server/storefront-route";
import { listStorefrontProducts } from "@/server/domain/storefront";

export const GET = storefrontRoute(async (request, shop) => {
  const sp = new URL(request.url).searchParams;
  return json(
    await listStorefrontProducts(shop.id, {
      q: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      collectionId: sp.get("collection") ?? undefined,
      cursor: sp.get("cursor"),
    }),
  );
});
