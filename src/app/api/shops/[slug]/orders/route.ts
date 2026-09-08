import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  listShopOrders,
  OrderError,
  serializeOrder,
  type OrderStatus,
} from "@/lib/orders";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "all";
    const status =
      statusParam === "new" ||
      statusParam === "confirmed" ||
      statusParam === "fulfilled" ||
      statusParam === "cancelled" ||
      statusParam === "all"
        ? (statusParam as OrderStatus | "all")
        : "all";

    const { orders } = await listShopOrders({
      shopSlug: slug,
      ownerUserId: session.userId,
      status,
    });

    return jsonOk({
      orders: orders.map((o) => serializeOrder(o)),
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
