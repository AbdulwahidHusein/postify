import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { allowedActions } from "@/server/auth/authorize";
import { serializeShop, settingsPatchSchema, updateShopSettings } from "@/server/domain/shops";
import { scheduleButtonSync } from "@/server/domain/buttons";
import { db } from "@/server/db";
import { productSources } from "@/server/db/schema";
import { and, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = shopRoute("shop.view", async (_req, { shop, role }) =>
  json({ shop: serializeShop(shop), role, actions: allowedActions(role) }),
);

export const PATCH = shopRoute("shop.settings", async (request, { shop }) => {
  const patch = await readJson(request, settingsPatchSchema.parse);
  const updated = await updateShopSettings(shop, patch);
  // Button language or on/off changes every post's buttons.
  if (patch.buttonLanguage !== undefined || patch.buttonsOnPosts !== undefined) {
    const rows = await db
      .select({ id: productSources.id })
      .from(productSources)
      .where(and(eq(productSources.shopId, shop.id), ne(productSources.buttonStatus, "deleted")));
    await scheduleButtonSync(rows.map((r) => r.id));
  }
  return json({ shop: serializeShop(updated) });
});
