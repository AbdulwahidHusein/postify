import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import { ADMIN_PAGE_SIZE } from "@/lib/pagination";
import {
  createManualProduct,
  listProductsForShop,
  serializeProduct,
  type ProductStatus,
} from "@/lib/products";
import { getOwnedShopBySlug } from "@/lib/shops";

type Props = {
  params: Promise<{ slug: string }>;
};

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional().nullable(),
  price: z.number().nonnegative().nullable().optional(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().max(160).optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
  tags: z.string().trim().max(500).optional().nullable(),
  condition: z.string().trim().max(60).optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  attributes: z.record(z.string(), z.string()).optional().nullable(),
  isNegotiable: z.boolean().optional(),
  shippingInfo: z.string().trim().max(500).optional().nullable(),
  returnPolicy: z.string().trim().max(500).optional().nullable(),
  status: z.enum(["draft", "published", "sold", "archived"]).optional(),
});

export async function GET(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const pageRaw = url.searchParams.get("page");
    const limitRaw = url.searchParams.get("limit");
    const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const statusParam = url.searchParams.get("status") ?? "all";
    const status =
      statusParam === "draft" ||
      statusParam === "published" ||
      statusParam === "sold" ||
      statusParam === "archived" ||
      statusParam === "all"
        ? (statusParam as ProductStatus | "all")
        : "all";

    const { products: rows, pagination } = await listProductsForShop(shop.id, {
      q,
      status,
      category,
      page: Number.isFinite(page) ? page : 1,
      limit:
        limit && Number.isFinite(limit) && limit > 0 ? limit : undefined,
      defaultPageSize: ADMIN_PAGE_SIZE,
    });

    return jsonOk({
      products: rows.map(serializeProduct),
      pagination,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { slug } = await params;
    const shop = await getOwnedShopBySlug(slug, session.userId);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const body = createSchema.parse(await request.json());
    const product = await createManualProduct({
      shop,
      title: body.title,
      description: body.description,
      price: body.price ?? null,
      compareAtPrice: body.compareAtPrice ?? null,
      currency: body.currency,
      category: body.category,
      sku: body.sku,
      stockQuantity: body.stockQuantity ?? null,
      tags: body.tags,
      condition: body.condition,
      brand: body.brand,
      model: body.model,
      location: body.location,
      attributes: body.attributes,
      isNegotiable: body.isNegotiable,
      shippingInfo: body.shippingInfo,
      returnPolicy: body.returnPolicy,
      status: body.status ?? "draft",
    });

    return jsonOk({ product: serializeProduct(product) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
