import { NextResponse } from "next/server";
import { attributesForCategory } from "@/lib/catalog/attributes";

/**
 * GET /api/catalog/attributes?category=<path or free text>
 *
 * Returns the mined attribute dropdowns for a single category. Lazy per-category
 * fetch so the full mined JSON is never shipped to the client.
 *
 * Example: /api/catalog/attributes?category=Vehicles%20%3E%20Cars
 * → [{ name: "Condition", unit: null, values: ["Local Used", ...] }, ...]
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "";

  if (!category.trim()) {
    return NextResponse.json({ attributes: [] });
  }

  const attributes = attributesForCategory(category);
  return NextResponse.json({ attributes });
}
