import { json, notFound } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { deleteProductImage } from "@/server/domain/products";

export const DELETE = shopRoute<{ shop: string; id: string; imageId: string }>(
  "products.manage",
  async (_req, { shop }, { id, imageId }) => {
    const del = await deleteProductImage(shop.id, id, imageId);
    if (!del) throw notFound("Image not found");
    return json({ ok: true });
  },
);
