import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { getUserById, serializeUser } from "@/lib/auth/users";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return jsonOk({ user: null });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return jsonOk({ user: null });
    }

    return jsonOk({ user: serializeUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
