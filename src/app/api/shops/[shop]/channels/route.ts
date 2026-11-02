import { json } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { listChannels, serializeChannel } from "@/server/domain/channels";
import { buttonHealth } from "@/server/domain/buttons";
import { botStartLink, channelRightsLink, groupRightsLink } from "@/server/services/telegram";

export const dynamic = "force-dynamic";

export const GET = shopRoute("channels.manage", async (_req, { shop }) => {
  const [list, health] = await Promise.all([listChannels(shop.id), buttonHealth(shop.id)]);
  return json({
    channels: list.map((c) => {
      const h = health.get(c.id);
      return {
        ...serializeChannel(c),
        health: {
          inline: h?.inline ?? 0,
          cards: h?.cards ?? 0,
          failing: h?.failing ?? 0,
          pending: h?.pending ?? 0,
          deleted: h?.deleted ?? 0,
          lastSyncedAt: h?.lastSyncedAt?.toISOString() ?? null,
        },
      };
    }),
    links: { connect: botStartLink("connect"), channelRights: channelRightsLink(), groupRights: groupRightsLink() },
  });
});
