import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  ChatError,
  getOrCreateProductConversation,
  serializeConversation,
} from "@/lib/chat";

type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { conversation } = await getOrCreateProductConversation({
      productId: id,
      buyerUserId: session.userId,
    });
    return jsonOk({
      conversation: serializeConversation(conversation, "buyer"),
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
