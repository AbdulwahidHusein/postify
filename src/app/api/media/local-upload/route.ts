import { putObject, verifyLocalUpload, MAX_UPLOAD_BYTES } from "@/server/services/storage";

/** Local-dev target for presigned uploads (production uploads go to R2 directly). */
export async function PUT(request: Request) {
  const ok = verifyLocalUpload(new URL(request.url).searchParams);
  if (!ok) return new Response("forbidden", { status: 403 });
  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_UPLOAD_BYTES) return new Response("too large", { status: 413 });
  await putObject(ok.key, body, ok.contentType, "private");
  return new Response(null, { status: 200 });
}
