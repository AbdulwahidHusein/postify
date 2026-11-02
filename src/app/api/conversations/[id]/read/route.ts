import { json, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { conversationAccess, markRead } from "@/server/domain/chat";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireViewer();
  const { id } = await ctx.params;
  const { role } = await conversationAccess(id, user.id);
  await markRead(id, role);
  return json({ ok: true });
});
