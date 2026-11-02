import { z } from "zod";
import { json, readJson, route, AppError } from "@/server/http";
import { requireViewer } from "@/server/request";
import { conversationAccess } from "@/server/domain/chat";
import { uuidv7 } from "@/server/ids";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, presignUpload } from "@/server/services/storage";

const body = z.object({ contentType: z.string(), size: z.number().int().positive() });

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, ctx) => {
  const user = await requireViewer();
  const { id } = await ctx.params;
  await conversationAccess(id, user.id);
  const { contentType, size } = await readJson(request, body.parse);
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new AppError("Use a JPG, PNG or WebP image");
  if (size > MAX_UPLOAD_BYTES) throw new AppError("Images must be 10 MB or smaller");
  const key = `chat/${id}/${uuidv7()}.${contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1]}`;
  return json({ key, ...(await presignUpload(key, contentType)) });
});
