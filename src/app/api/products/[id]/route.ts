import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  deleteProduct,
  getProductById,
  serializeProduct,
  updateProduct,
} from "@/lib/products";
import { getOwnedShop } from "@/lib/shops";

type Props = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  price: z.number().nonnegative().nullable().optional(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().max(160).optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
  tags: z.string().trim().max(240).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

async function requireOwnedProduct(productId: string, userId: string) {
  const product = await getProductById(productId);
  if (!product) {
    return {
      error: NextResponse.json({ error: "Product not found" }, { status: 404 }),
    };
  }
  const shop = await getOwnedShop(product.shopId, userId);
  if (!shop) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { product, shop };
}

export async function GET(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await requireOwnedProduct(id, session.userId);
    if ("error" in result && result.error) return result.error;
    return jsonOk({ product: serializeProduct(result.product!) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await requireOwnedProduct(id, session.userId);
    if ("error" in result && result.error) return result.error;

    const body = patchSchema.parse(await request.json());
    const updated = await updateProduct(id, body);
    const full = await getProductById(updated.id);
    return jsonOk({ product: serializeProduct(full!) });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await requireOwnedProduct(id, session.userId);
    if ("error" in result && result.error) return result.error;

    await deleteProduct(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
