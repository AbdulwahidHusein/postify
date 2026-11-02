import { json, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { disconnectChannel } from "@/server/domain/channels";

export const DELETE = shopRoute<{ shop: string; id: string }>("channels.manage", async (_req, { shop }, { id }) => {
  const row = await disconnectChannel(shop.id, id);
  if (!row) throw notFound("Channel not found");
  return json({ ok: true });
});
