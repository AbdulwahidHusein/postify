import { json } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { countOrderTabs, listOrders, serializeOrder, type OrderTab } from "@/server/domain/orders";

export const dynamic = "force-dynamic";

export const GET = shopRoute("orders.manage", async (request, { shop }) => {
  const sp = searchParams(request);
  const page = await listOrders(shop.id, {
    tab: (sp.get("tab") as OrderTab) ?? "all",
    q: sp.get("q") ?? undefined,
    cursor: sp.get("cursor"),
    customerId: sp.get("customer") ?? undefined,
  });
  return json({ items: page.items.map(serializeOrder), nextCursor: page.nextCursor, counts: await countOrderTabs(shop.id) });
});
