import { z } from "zod";
import { json, readJson, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { applyOrderAction, getOrder, serializeOrder } from "@/server/domain/orders";
import { serializeCustomer } from "@/server/domain/customers";

type P = { shop: string; id: string };
export const dynamic = "force-dynamic";

export const GET = shopRoute<P>("orders.manage", async (_req, { shop }, { id }) => {
  const order = await getOrder(shop.id, id);
  if (!order) throw notFound("Order not found");
  return json({ order: serializeOrder(order), customer: serializeCustomer(order.customer) });
});

const body = z.object({
  action: z.enum(["confirm", "ship", "deliver", "complete", "cancel", "mark_paid"]),
  reason: z.string().trim().max(300).optional(),
});

export const POST = shopRoute<P>("orders.manage", async (request, { shop, session }, { id }) => {
  const { action, reason } = await readJson(request, body.parse);
  await applyOrderAction({ shopId: shop.id, orderId: id, action, actorUserId: session.userId, reason });
  const order = await getOrder(shop.id, id);
  return json({ order: order ? serializeOrder(order) : null });
});
