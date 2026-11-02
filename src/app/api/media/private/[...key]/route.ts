import { isProduction } from "@/server/env";
import { getObject } from "@/server/services/storage";
import { getViewer } from "@/server/request";
import { conversationAccess } from "@/server/domain/chat";

/** Local-dev private object reads (production uses signed R2 URLs). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (isProduction) return new Response("not found", { status: 404 });
  const parts = (await ctx.params).key;
  const user = await getViewer();
  if (!user || parts[0] !== "chat" || !parts[1]) return new Response("forbidden", { status: 403 });
  try {
    await conversationAccess(parts[1], user.id);
    const body = await getObject(parts.join("/"), "private");
    return new Response(new Uint8Array(body), { headers: { "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
