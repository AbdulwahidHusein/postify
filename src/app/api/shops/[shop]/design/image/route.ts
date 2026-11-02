import { z } from "zod";
import sharp from "sharp";
import { json, readJson, AppError } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { shortCode } from "@/server/ids";
import { getObject, publicUrl, putObject } from "@/server/services/storage";

export const dynamic = "force-dynamic";

const body = z.object({ key: z.string().max(300), shape: z.enum(["banner", "square"]).default("banner") });

/** Turn an uploaded original into a public, web-sized image for a store section. */
export const POST = shopRoute("shop.settings", async (request, { shop }) => {
  const { key, shape } = await readJson(request, body.parse);
  if (!key.startsWith(`originals/shops/${shop.id}/`)) throw new AppError("Invalid upload");
  const original = await getObject(key, "private");
  const out = await sharp(original)
    .rotate()
    .resize(shape === "banner" ? { width: 1600, height: 1200, fit: "inside", withoutEnlargement: true } : { width: 900, height: 900, fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  const publicKey = `shops/${shop.id}/section-${shortCode(10).toLowerCase()}.webp`;
  await putObject(publicKey, out, "image/webp", "public");
  return json({ key: publicKey, url: publicUrl(publicKey) });
});
