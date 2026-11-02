import { z } from "zod";
import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { bulkUpdateStatus } from "@/server/domain/products";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";
import { addToCollection, removeFromCollection } from "@/server/domain/collections";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["publish", "draft", "sold", "archive", "delete"]), ids: z.array(z.string().uuid()).min(1).max(200) }),
  z.object({ action: z.literal("add_to_collection"), collectionId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(200) }),
  z.object({ action: z.literal("remove_from_collection"), collectionId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

export const POST = shopRoute("products.manage", async (request, { shop }) => {
  const input = await readJson(request, body.parse);
  if (input.action === "add_to_collection") return json({ count: await addToCollection(shop.id, input.collectionId, input.ids) });
  if (input.action === "remove_from_collection") return json({ count: await removeFromCollection(shop.id, input.collectionId, input.ids) });
  const count = await bulkUpdateStatus(shop, input.ids, input.action);
  // Archived/sold/published changes all alter the post buttons.
  await scheduleButtonSyncForProducts(shop.id, input.ids);
  return json({ count });
});
