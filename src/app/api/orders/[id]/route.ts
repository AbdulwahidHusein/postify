import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  OrderError,
  serializeOrder,
  updateOrderStatus,
} from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["new", "confirmed", "fulfilled", "cancelled"]),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const order = await updateOrderStatus({
      orderId: id,
      ownerUserId: session.userId,
      status: body.status,
    });
    return jsonOk({ order: serializeOrder(order) });
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
