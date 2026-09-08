import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  ChatError,
  listBuyerInbox,
  serializeConversation,
} from "@/lib/chat";

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await listBuyerInbox({ buyerUserId: session.userId });
    return jsonOk({
      conversations: rows.map((c) => serializeConversation(c, "buyer")),
    });
  } catch (error) {
    if (error instanceof ChatError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
