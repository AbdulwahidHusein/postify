import { and, eq } from "drizzle-orm";
import { json, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { db } from "@/server/db";
import { channels } from "@/server/db/schema";
import { refreshChannelRights, serializeChannel } from "@/server/domain/channels";

export const POST = shopRoute<{ shop: string; id: string }>("channels.manage", async (_req, { shop }, { id }) => {
  const ch = await db.query.channels.findFirst({ where: and(eq(channels.id, id), eq(channels.shopId, shop.id)) });
  if (!ch) throw notFound("Channel not found");
  return json({ channel: serializeChannel(await refreshChannelRights(ch)) });
});
