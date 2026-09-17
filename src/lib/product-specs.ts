/**
 * Flatten product core fields + dynamic attributes into display rows.
 * Empty values are dropped. Core fields come first in a stable order.
 */
export type ProductSpecRow = { label: string; value: string };

const CORE_SKIP_IN_ATTRS = new Set([
  "brand",
  "model",
  "make",
  "condition",
  "location",
  "category",
]);

export function buildProductSpecRows(product: {
  category?: string | null;
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  location?: string | null;
  attributes?: Record<string, string> | null;
}): ProductSpecRow[] {
  const rows: ProductSpecRow[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (!v) return;
    rows.push({ label, value: v });
  };

  push("Category", product.category);
  push("Condition", product.condition);
  push("Brand", product.brand);
  push("Model", product.model);
  push("Location", product.location);

  const attrs = product.attributes ?? {};
  const extra = Object.entries(attrs)
    .filter(([k, v]) => {
      if (!v?.trim()) return false;
      if (CORE_SKIP_IN_ATTRS.has(k.trim().toLowerCase())) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [label, value] of extra) {
    push(label, value);
  }

  return rows;
}

/** Short line for cards: "Samsung · Galaxy S23" or similar. */
export function productSpecSummary(product: {
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
}): string | null {
  const parts = [product.brand, product.model, product.condition]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (!parts.length) return null;
  return parts.join(" · ");
}
