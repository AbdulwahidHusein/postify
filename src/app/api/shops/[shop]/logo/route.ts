import { z } from "zod";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { json, readJson, AppError } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { db } from "@/server/db";
import { shops } from "@/server/db/schema";
import { shortCode } from "@/server/ids";
import { getObject, putObject } from "@/server/services/storage";
import { serializeShop } from "@/server/domain/shops";

const body = z.object({ key: z.string().max(300), kind: z.enum(["logo", "banner"]).default("logo") });

export const POST = shopRoute("shop.settings", async (request, { shop }) => {
  const { key, kind } = await readJson(request, body.parse);
  if (!key.startsWith(`originals/shops/${shop.id}/`)) throw new AppError("Invalid upload");
  const original = await getObject(key, "private");
  const out = await sharp(original)
    .rotate()
    .resize(kind === "logo" ? { width: 256, height: 256, fit: "cover" } : { width: 1600, height: 600, fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  const publicKey = `shops/${shop.id}/${kind}-${shortCode(8)}.webp`;
  await putObject(publicKey, out, "image/webp", "public");
  const [updated] = await db
    .update(shops)
    .set(
      kind === "logo"
        ? { logoKey: publicKey, updatedAt: new Date() }
        : { settings: { ...shop.settings, theme: { ...shop.settings.theme, bannerKey: publicKey } }, updatedAt: new Date() },
    )
    .where(eq(shops.id, shop.id))
    .returning();
  return json({ shop: serializeShop(updated) });
});
