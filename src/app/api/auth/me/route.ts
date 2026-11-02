import { json, route } from "@/server/http";
import { getViewer } from "@/server/request";
import { serializeUser } from "@/server/auth/users";
import { listShopsForUser } from "@/server/domain/shops";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getViewer();
  if (!user) return json({ user: null, shops: [] });
  const shops = await listShopsForUser(user.id);
  return json({
    user: serializeUser(user),
    shops: shops.map((s) => ({ handle: s.shop.handle, name: s.shop.name, role: s.role })),
  });
});
