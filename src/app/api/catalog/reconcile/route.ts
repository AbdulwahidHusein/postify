import { NextResponse } from "next/server";
import { reconcileListing } from "@/lib/catalog/resolve";

/**
 * POST /api/catalog/reconcile
 * Body: { category?, brand?, model?, condition?, attributes?, preferredCategories? }
 *
 * Maps free-text extract fields onto canonical catalog values (server-only fuzzy match).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = (body ?? {}) as {
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    condition?: string | null;
    attributes?: Record<string, string> | null;
    preferredCategories?: string[];
  };

  const result = reconcileListing({
    category: input.category,
    brand: input.brand,
    model: input.model,
    condition: input.condition,
    attributes: input.attributes,
    preferredCategories: input.preferredCategories,
  });

  return NextResponse.json(result);
}
