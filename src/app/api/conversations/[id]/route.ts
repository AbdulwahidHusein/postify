import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  ChatError,
  assertConversationAccess,
  closeConversation,
  listMessages,
  serializeConversation,
  serializeMessage,
  sendMessageAndNotify,
} from "@/lib/chat";
import {
  saveLocalChatImage,
  uploadLimitsMessage,
} from "@/lib/storage";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const url = new URL(request.url);
    const after = url.searchParams.get("after");
    const { conversation, role } = await assertConversationAccess(
      id,
      session.userId,
    );
    const { messages } = await listMessages({
      conversationId: id,
      userId: session.userId,
      after,
    });
    return jsonOk({
      conversation: serializeConversation(conversation, role),
      messages: messages.map(serializeMessage),
      role,
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

const jsonPostSchema = z.object({
  body: z.string().trim().max(2000).optional().default(""),
  clientId: z.string().trim().min(1).max(64).optional().nullable(),
});

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await assertConversationAccess(id, session.userId);

    const contentType = request.headers.get("content-type") ?? "";
    let body = "";
    let clientId: string | null = null;
    let imageUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = String(form.get("body") ?? "").trim();
      const cid = form.get("clientId");
      clientId = typeof cid === "string" && cid.trim() ? cid.trim() : null;
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        const saved = await saveLocalChatImage(id, file);
        imageUrl = saved.url;
      }
    } else {
      const parsed = jsonPostSchema.parse(await request.json());
      body = parsed.body;
      clientId = parsed.clientId ?? null;
    }

    const result = await sendMessageAndNotify({
      conversationId: id,
      userId: session.userId,
      body,
      imageUrl,
      clientId,
    });
    return jsonOk({
      message: serializeMessage(result.message),
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (error instanceof ChatError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (
      error instanceof Error &&
      error.message === uploadLimitsMessage()
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = z
      .object({ action: z.enum(["close"]) })
      .parse(await request.json());
    if (body.action === "close") {
      await closeConversation({
        conversationId: id,
        userId: session.userId,
      });
    }
    return jsonOk({ ok: true });
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
