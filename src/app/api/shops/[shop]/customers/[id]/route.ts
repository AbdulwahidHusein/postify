import { json, readJson, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { customerPatchSchema, getCustomer, serializeCustomer, updateCustomer } from "@/server/domain/customers";
import { listOrders, serializeOrder } from "@/server/domain/orders";

type P = { shop: string; id: string };
export const dynamic = "force-dynamic";

export const GET = shopRoute<P>("customers.view", async (_req, { shop }, { id }) => {
  const c = await getCustomer(shop.id, id);
  if (!c) throw notFound("Customer not found");
  const orders = await listOrders(shop.id, { customerId: id, limit: 50 });
  return json({ customer: serializeCustomer(c), orders: orders.items.map(serializeOrder) });
});

export const PATCH = shopRoute<P>("orders.manage", async (request, { shop }, { id }) => {
  const patch = await readJson(request, customerPatchSchema.parse);
  return json({ customer: serializeCustomer(await updateCustomer(shop.id, id, patch)) });
});
