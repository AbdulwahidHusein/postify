import { json } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { listSellerInbox } from "@/server/domain/chat";

export const dynamic = "force-dynamic";

export const GET = shopRoute("inbox.manage", async (request, { shop }) => {
  const sp = searchParams(request);
  return json({
    items: await listSellerInbox(shop.id, {
      unread: sp.get("filter") === "unread",
      productId: sp.get("product") ?? undefined,
    }),
  });
});
