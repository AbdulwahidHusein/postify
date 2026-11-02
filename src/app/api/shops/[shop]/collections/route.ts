import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { collectionSchema, createCollection, listCollections } from "@/server/domain/collections";

export const dynamic = "force-dynamic";

export const GET = shopRoute("products.manage", async (_req, { shop }) => json({ items: await listCollections(shop.id) }));

export const POST = shopRoute("products.manage", async (request, { shop }) => {
  const input = await readJson(request, collectionSchema.parse);
  return json({ collection: await createCollection(shop.id, input) }, { status: 201 });
});
