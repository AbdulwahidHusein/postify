import { z } from "zod";
import { json, readJson, route } from "@/server/http";
import { requireViewer } from "@/server/request";
import { createShop, listShopsForUser, serializeShop } from "@/server/domain/shops";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireViewer();
  const rows = await listShopsForUser(user.id);
  return json({ shops: rows.map((r) => ({ ...serializeShop(r.shop), role: r.role })) });
});

const body = z.object({
  name: z.string().trim().min(2).max(80),
  handle: z.string().optional(),
  locale: z.enum(["en", "am"]).optional(),
});

export const POST = route(async (request) => {
  const user = await requireViewer();
  const input = await readJson(request, body.parse);
  const shop = await createShop({ ownerUserId: user.id, ...input });
  return json({ shop: serializeShop(shop) }, { status: 201 });
});
