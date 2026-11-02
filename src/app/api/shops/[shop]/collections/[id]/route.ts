import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { collectionSchema, deleteCollection, updateCollection } from "@/server/domain/collections";

type P = { shop: string; id: string };

export const PATCH = shopRoute<P>("products.manage", async (request, { shop }, { id }) => {
  const input = await readJson(request, collectionSchema.partial().parse);
  return json({ collection: await updateCollection(shop.id, id, input) });
});

export const DELETE = shopRoute<P>("products.manage", async (_req, { shop }, { id }) => {
  await deleteCollection(shop.id, id);
  return json({ ok: true });
});
