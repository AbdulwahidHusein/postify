import { json } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { repairChannelButtons } from "@/server/domain/buttons";

export const POST = shopRoute<{ shop: string; id: string }>("channels.manage", async (_req, { shop }, { id }) =>
  json({ queued: await repairChannelButtons(shop.id, id) }),
);
