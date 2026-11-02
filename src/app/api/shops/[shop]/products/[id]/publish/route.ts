import { z } from "zod";
import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { publishToChannel } from "@/server/domain/publish";

export const POST = shopRoute<{ shop: string; id: string }>("channels.manage", async (request, { shop }, { id }) => {
  const { channelId } = await readJson(request, z.object({ channelId: z.string().uuid() }).parse);
  const source = await publishToChannel(shop, id, channelId);
  return json({ sourceId: source.id }, { status: 201 });
});
