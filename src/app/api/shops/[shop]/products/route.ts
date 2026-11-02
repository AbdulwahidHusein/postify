import { json, readJson } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { enqueue } from "@/server/services/tasks";
import {
  countByStatus,
  createManualProduct,
  createProductSchema,
  listProducts,
  serializeProduct,
  type ProductListFilters,
} from "@/server/domain/products";

export const dynamic = "force-dynamic";

export const GET = shopRoute("products.manage", async (request, { shop }) => {
  const sp = searchParams(request);
  const page = await listProducts(shop.id, {
    q: sp.get("q") ?? undefined,
    status: (sp.get("status") as ProductListFilters["status"]) ?? undefined,
    category: sp.get("category") ?? undefined,
    channelId: sp.get("channel") ?? undefined,
    collectionId: sp.get("collection") ?? undefined,
    cursor: sp.get("cursor"),
    limit: Number(sp.get("limit") ?? 50),
  });
  return json({
    items: page.items.map(serializeProduct),
    nextCursor: page.nextCursor,
    counts: sp.get("withCounts") ? await countByStatus(shop.id) : undefined,
  });
});

export const POST = shopRoute("products.manage", async (request, { shop }) => {
  const input = await readJson(request, createProductSchema.parse);
  const product = await createManualProduct(shop, input);
  for (const img of product.images) await enqueue("media", { imageId: img.id }, { name: img.id });
  return json({ product: serializeProduct(product) }, { status: 201 });
});
