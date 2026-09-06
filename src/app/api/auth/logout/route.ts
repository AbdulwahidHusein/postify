import { jsonError, jsonOk } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST() {
  try {
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
