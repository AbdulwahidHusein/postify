import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  createOrderIntent,
  OrderError,
  serializeOrder,
} from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  buyerName: z.string().min(2).max(120),
  buyerPhone: z.string().min(6).max(40),
  notes: z.string().max(1000).optional().nullable(),
  quantity: z.number().int().min(1).max(99).optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const result = await createOrderIntent({
      productId: id,
      buyerUserId: session.userId,
      buyerName: body.buyerName,
      buyerPhone: body.buyerPhone,
      notes: body.notes,
      quantity: body.quantity,
    });
    return jsonOk({
      order: serializeOrder(result.order),
      conversationId: result.conversationId,
    });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
