import { z } from "zod";
import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { enqueue } from "@/server/services/tasks";
import { addProductImage, reorderImages, serializeImage } from "@/server/domain/products";

type P = { shop: string; id: string };

export const POST = shopRoute<P>("products.manage", async (request, { shop }, { id }) => {
  const { key } = await readJson(request, z.object({ key: z.string().max(300) }).parse);
  const img = await addProductImage(shop, id, key);
  await enqueue("media", { imageId: img.id }, { name: img.id });
  return json({ image: serializeImage(img) }, { status: 201 });
});

export const PATCH = shopRoute<P>("products.manage", async (request, { shop }, { id }) => {
  const { order } = await readJson(request, z.object({ order: z.array(z.string().uuid()).max(10) }).parse);
  await reorderImages(shop.id, id, order);
  return json({ ok: true });
});
