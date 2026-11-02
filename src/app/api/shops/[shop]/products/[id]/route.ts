import { json, readJson, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import {
  affectsButtons,
  bulkUpdateStatus,
  getProductBundle,
  productPatchSchema,
  serializeProduct,
  updateProduct,
} from "@/server/domain/products";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";
import { listChannels, serializeChannel } from "@/server/domain/channels";
import { postLink } from "@/server/services/telegram";
import { trackEvent } from "@/server/domain/analytics";

type P = { shop: string; id: string };
export const dynamic = "force-dynamic";

export const GET = shopRoute<P>("products.manage", async (_req, { shop }, { id }) => {
  const bundle = await getProductBundle(shop.id, id);
  if (!bundle) throw notFound("Product not found");
  const channels = await listChannels(shop.id);
  const byId = new Map(channels.map((c) => [c.id, c]));
  return json({
    product: serializeProduct(bundle),
    sources: (bundle.sources ?? []).map((s) => ({
      id: s.id,
      channel: byId.get(s.channelId) ? serializeChannel(byId.get(s.channelId)!) : null,
      buttonMode: s.buttonMode,
      buttonStatus: s.buttonStatus,
      lastError: s.lastError,
      link: postLink({ username: byId.get(s.channelId)?.username, chatId: s.chatId, messageId: s.messageId }),
    })),
    channels: channels.filter((c) => c.status === "connected").map(serializeChannel),
  });
});

export const PATCH = shopRoute<P>("products.manage", async (request, { shop, session }, { id }) => {
  const patch = await readJson(request, productPatchSchema.parse);
  const updated = await updateProduct(shop, id, patch);
  if (affectsButtons(patch)) await scheduleButtonSyncForProducts(shop.id, [id]);
  await trackEvent({ shopId: shop.id, type: "product_updated", productId: id, actorUserId: session.userId, data: { fields: Object.keys(patch) } });
  return json({ product: serializeProduct(updated) });
});

export const DELETE = shopRoute<P>("products.manage", async (_req, { shop }, { id }) => {
  const n = await bulkUpdateStatus(shop, [id], "delete");
  if (!n) throw notFound("Product not found");
  await scheduleButtonSyncForProducts(shop.id, [id]);
  return json({ ok: true });
});
