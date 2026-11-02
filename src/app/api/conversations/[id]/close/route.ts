import { json, route, forbidden } from "@/server/http";
import { requireViewer } from "@/server/request";
import { closeConversation, conversationAccess } from "@/server/domain/chat";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireViewer();
  const { id } = await ctx.params;
  const { role } = await conversationAccess(id, user.id);
  if (role !== "seller") throw forbidden();
  await closeConversation(id);
  return json({ ok: true });
});
