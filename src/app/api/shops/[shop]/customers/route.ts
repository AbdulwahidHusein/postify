import { json } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { listCustomers, serializeCustomer } from "@/server/domain/customers";

export const dynamic = "force-dynamic";

export const GET = shopRoute("customers.view", async (request, { shop }) => {
  const sp = searchParams(request);
  const page = await listCustomers(shop.id, { q: sp.get("q") ?? undefined, cursor: sp.get("cursor") });
  return json({ items: page.items.map(serializeCustomer), nextCursor: page.nextCursor });
});
