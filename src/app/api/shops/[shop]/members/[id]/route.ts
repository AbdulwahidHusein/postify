import { json } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { removeMember } from "@/server/domain/members";

export const DELETE = shopRoute<{ shop: string; id: string }>("shop.staff", async (_req, { shop, session }, { id }) => {
  await removeMember(shop.id, id, session.userId);
  return json({ ok: true });
});
