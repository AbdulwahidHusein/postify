import { z } from "zod";
import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { createInvite, listMembers } from "@/server/domain/members";

export const dynamic = "force-dynamic";

export const GET = shopRoute("shop.view", async (_req, { shop }) => json({ items: await listMembers(shop.id) }));

export const POST = shopRoute("shop.staff", async (request, { shop, session }) => {
  const { role } = await readJson(request, z.object({ role: z.enum(["admin", "staff"]) }).parse);
  return json(await createInvite(shop.id, role, session.userId), { status: 201 });
});
