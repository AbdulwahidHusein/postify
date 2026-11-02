import { isProduction } from "@/server/env";
import { readLocalPublic } from "@/server/services/storage";

/** Local-dev stand-in for the public image CDN (MEDIA_PUBLIC_URL in production). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (isProduction) return new Response("not found", { status: 404 });
  const key = (await ctx.params).key.join("/");
  const body = await readLocalPublic(key).catch(() => null);
  if (!body) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": key.endsWith(".webp") ? "image/webp" : "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
