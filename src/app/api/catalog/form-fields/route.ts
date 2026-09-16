import { NextResponse } from "next/server";
import {
  brandsForFormCategory,
  formFieldsForCategory,
  modelsForBrand,
  selectFieldsForCategory,
} from "@/lib/catalog/form-fields";
import { attributesForCategory } from "@/lib/catalog/attributes";
import { COMMON_CONDITIONS, mergeOptions } from "@/lib/catalog/field-options";
import {
  BRAND_INLINE_CAP,
  suggestBrands,
  suggestModels,
} from "@/lib/catalog/resolve";

/**
 * GET /api/catalog/form-fields?category=…&brand=…&kind=brand|model&q=…&limit=
 *
 * Cascading Brand/Model options from mined form_fields. Large lists are capped
 * unless `q` is provided (typeahead). Catalog JSON never ships to the client bundle.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "";
  const brand = url.searchParams.get("brand") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const kind = (url.searchParams.get("kind") ?? "").toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(80, Math.max(1, Math.floor(limitRaw)))
    : 30;

  const headers = {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  };

  if (!category.trim()) {
    return NextResponse.json(
      {
        brands: [],
        brandsTruncated: false,
        brandField: null,
        models: [],
        modelsTruncated: false,
        fields: [],
        attributes: [],
        conditions: COMMON_CONDITIONS,
        suggestions: [],
      },
      { headers },
    );
  }

  // Typeahead mode — return ranked matches only.
  if (kind === "brand") {
    const suggestions = suggestBrands(category, q, limit).map((h) => h.value);
    return NextResponse.json(
      { kind: "brand", suggestions, q },
      { headers },
    );
  }
  if (kind === "model") {
    const suggestions = brand
      ? suggestModels(category, brand, q, limit).map((h) => h.value)
      : [];
    return NextResponse.json(
      { kind: "model", suggestions, q, brand },
      { headers },
    );
  }

  const allBrands = brandsForFormCategory(category);
  const brandsTruncated = !q.trim() && allBrands.length > BRAND_INLINE_CAP;
  const brands = q.trim()
    ? suggestBrands(category, q, limit).map((h) => h.value)
    : brandsTruncated
      ? allBrands.slice(0, BRAND_INLINE_CAP)
      : allBrands;

  const allModels = brand ? modelsForBrand(category, brand) : [];
  const modelsTruncated = !q.trim() && allModels.length > BRAND_INLINE_CAP;
  const models = q.trim() && brand
    ? suggestModels(category, brand, q, limit).map((h) => h.value)
    : modelsTruncated
      ? allModels.slice(0, BRAND_INLINE_CAP)
      : allModels;

  const fields = selectFieldsForCategory(category);
  const listingAttrs = attributesForCategory(category);
  const form = formFieldsForCategory(category);

  const conditionField = fields.find((f) => f.name === "Condition");
  const conditions = mergeOptions(
    conditionField?.values,
    listingAttrs.find((a) => a.name.toLowerCase() === "condition")?.values,
    COMMON_CONDITIONS,
  );

  return NextResponse.json(
    {
      brands,
      brandsTotal: allBrands.length,
      brandsTruncated,
      brandField:
        form?.brandField ??
        fields.find((f) => f.name === "Brand" || f.name === "Make")?.name ??
        (allBrands.length ? "Brand" : null),
      models,
      modelsTotal: allModels.length,
      modelsTruncated,
      conditions,
      fields: fields.filter(
        (f) => !["Brand", "Make", "Model", "Condition"].includes(f.name),
      ),
      attributes: listingAttrs.filter(
        (a) => !/^(condition|brand|model|make)$/i.test(a.name.trim()),
      ),
    },
    { headers },
  );
}
