import { json, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { listBuyerOrders, serializeOrder } from "@/server/domain/orders";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireViewer();
  const rows = await listBuyerOrders(user.id);
  return json({
    items: rows.map((o) => ({ ...serializeOrder(o), shop: { handle: o.shop.handle, name: o.shop.name }, accessToken: o.accessToken })),
  });
});
