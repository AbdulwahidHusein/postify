import { json, route } from "@/server/http";
import { clearSessionCookie } from "@/server/auth/session";

export const POST = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
