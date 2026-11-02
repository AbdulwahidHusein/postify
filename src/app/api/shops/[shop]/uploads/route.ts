import { z } from "zod";
import { json, readJson, AppError } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { uuidv7 } from "@/server/ids";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, presignUpload } from "@/server/services/storage";

export const dynamic = "force-dynamic";

const body = z.object({ contentType: z.string(), size: z.number().int().positive() });

/**
 * Presigned upload for shop images (product photos, logo, banner, store
 * sections). Originals land under originals/shops/<id>/ and are processed
 * by the endpoint that consumes the key.
 */
export const POST = shopRoute("products.manage", async (request, { shop }) => {
  const { contentType, size } = await readJson(request, body.parse);
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new AppError("Use a JPG, PNG or WebP image");
  if (size > MAX_UPLOAD_BYTES) throw new AppError("Images must be 10 MB or smaller");
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  const key = `originals/shops/${shop.id}/${uuidv7()}.${ext}`;
  return json({ key, ...(await presignUpload(key, contentType)) });
});
