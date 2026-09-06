import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import {
  addProductImage,
  getProductById,
  serializeProduct,
} from "@/lib/products";
import { getOwnedShop } from "@/lib/shops";
import { saveLocalProductImage, uploadLimitsMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

const MAX_IMAGES = 12;

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

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const owned = await requireOwnedProduct(id, session.userId);
    if ("error" in owned && owned.error) return owned.error;

    if ((owned.product!.images?.length ?? 0) >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES} images per product` },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const saved = await saveLocalProductImage(id, file);
    const altRaw = form.get("alt");
    const alt =
      typeof altRaw === "string" && altRaw.trim() ? altRaw.trim() : null;

    await addProductImage({
      productId: id,
      url: saved.url,
      alt,
    });

    const full = await getProductById(id);
    return jsonOk({ product: serializeProduct(full!) }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : uploadLimitsMessage();
    if (message.includes("JPG") || message.includes("8MB")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return jsonError(error);
  }
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(MAX_IMAGES),
});

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const owned = await requireOwnedProduct(id, session.userId);
    if ("error" in owned && owned.error) return owned.error;

    const body = reorderSchema.parse(await request.json());
    const { reorderProductImages } = await import("@/lib/products");
    await reorderProductImages(id, body.orderedIds);
    const full = await getProductById(id);
    return jsonOk({ product: serializeProduct(full!) });
  } catch (error) {
    return jsonError(error);
  }
}
