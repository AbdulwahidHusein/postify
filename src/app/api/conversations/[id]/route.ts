import { json, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { conversationAccess, conversationHeader, listMessages, markRead } from "@/server/domain/chat";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, ctx) => {
  const user = await requireViewer();
  const { id } = await ctx.params;
  const { conv, role } = await conversationAccess(id, user.id);
  const after = new URL(request.url).searchParams.get("after");
  const messages = await listMessages(id, after);
  if (messages.length) await markRead(id, role);
  return json({
    role,
    conversation: after ? undefined : await conversationHeader(conv),
    messages,
  });
});
