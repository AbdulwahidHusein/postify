import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import {
  deleteProductImage,
  getProductById,
  serializeProduct,
} from "@/lib/products";
import { getOwnedShop } from "@/lib/shops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string; imageId: string }>;
};

export async function DELETE(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id, imageId } = await params;

    const product = await getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const shop = await getOwnedShop(product.shopId, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const image = await db.query.productImages.findFirst({
      where: eq(productImages.id, imageId),
    });
    if (!image || image.productId !== id) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await deleteProductImage(imageId);
    const full = await getProductById(id);
    return jsonOk({ product: serializeProduct(full!) });
  } catch (error) {
    return jsonError(error);
  }
}
