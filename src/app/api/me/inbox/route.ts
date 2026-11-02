import { json, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { listBuyerInbox } from "@/server/domain/chat";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireViewer();
  return json({ items: await listBuyerInbox(user.id) });
});
