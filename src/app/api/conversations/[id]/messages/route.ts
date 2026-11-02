import { json, readJson, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { conversationAccess, sendMessage, sendSchema } from "@/server/domain/chat";
import { privateUrl } from "@/server/services/storage";

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, ctx) => {
  const user = await requireViewer();
  const { id } = await ctx.params;
  const { role } = await conversationAccess(id, user.id);
  const input = await readJson(request, sendSchema.parse);
  const m = await sendMessage({ conversationId: id, userId: user.id, role, ...input });
  return json(
    {
      message: {
        id: m.id,
        role: m.senderRole,
        kind: m.kind,
        body: m.body,
        image: m.imageKey ? await privateUrl(m.imageKey) : null,
        clientId: m.clientId,
        createdAt: m.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
});
