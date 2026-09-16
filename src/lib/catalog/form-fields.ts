import "server-only";

import formFields from "@/lib/catalog/form-fields.json";
import { taxonomyEntryByPath } from "@/lib/catalog/taxonomy-data";

type FieldValues = {
  name: string;
  attr: string;
  inputType: string;
  required: boolean;
  values: string[];
};

type CategoryFormFields = {
  categoryId: number;
  slug: string;
  path: string;
  group: string;
  fields: FieldValues[];
  brands: string[];
  brandField: "Brand" | "Make" | null;
  modelsByBrand: Record<string, string[]>;
};

const DATA = formFields as Record<string, CategoryFormFields>;

function resolveSlug(category: string): string | null {
  const trimmed = category?.trim();
  if (!trimmed) return null;
  if (DATA[trimmed]) return trimmed;
  const entry = taxonomyEntryByPath(trimmed);
  if (entry && DATA[entry.slug]) return entry.slug;
  const lower = trimmed.toLowerCase();
  const leaf = lower.split(">").pop()?.trim() ?? lower;
  for (const [slug, row] of Object.entries(DATA)) {
    if (row.path.toLowerCase() === lower) return slug;
    const rowLeaf = row.path.toLowerCase().split(">").pop()?.trim();
    if (rowLeaf === leaf) return slug;
  }
  return null;
}

/** Rows whose path is exactly category, or a child under that path/group. */
function rowsForCategoryScope(category: string): CategoryFormFields[] {
  const trimmed = category.trim();
  if (!trimmed) return [];

  const slug = resolveSlug(trimmed);
  if (slug && DATA[slug]) return [DATA[slug]];

  const lower = trimmed.toLowerCase();
  const prefix = `${lower} >`;
  const out: CategoryFormFields[] = [];
  for (const row of Object.values(DATA)) {
    const path = row.path.toLowerCase();
    if (path === lower || path.startsWith(prefix) || row.group.toLowerCase() === lower) {
      out.push(row);
    }
  }
  return out;
}

function dedupeSorted(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export function formFieldsForCategory(category: string): CategoryFormFields | null {
  const slug = resolveSlug(category);
  if (!slug) return null;
  return DATA[slug] ?? null;
}

/**
 * Brands for a category path. Leaf categories use mined lists; parent groups
 * (e.g. "Vehicles") roll up brands from all mined child leaves.
 */
export function brandsForFormCategory(category: string): string[] {
  const rows = rowsForCategoryScope(category);
  if (!rows.length) return [];
  return dedupeSorted(rows.flatMap((r) => r.brands ?? []));
}

/**
 * Models for brand within a category scope. Parent groups search all children
 * that have that brand (e.g. Vehicles + Toyota → Cars Toyota models).
 */
export function modelsForBrand(
  category: string,
  brand: string,
): string[] {
  const key = brand.trim();
  if (!key) return [];
  const rows = rowsForCategoryScope(category);
  const lower = key.toLowerCase();
  const models: string[] = [];
  for (const row of rows) {
    // Exact key first
    if (row.modelsByBrand[key]) {
      models.push(...row.modelsByBrand[key]);
      continue;
    }
    // Case-insensitive brand key
    for (const [b, list] of Object.entries(row.modelsByBrand)) {
      if (b.toLowerCase() === lower) {
        models.push(...list);
        break;
      }
    }
  }
  return dedupeSorted(models);
}

export function selectFieldsForCategory(category: string): FieldValues[] {
  const rows = rowsForCategoryScope(category);
  if (!rows.length) return [];
  // Prefer the most specific (single leaf) row's fields; else first child.
  if (rows.length === 1) return rows[0].fields ?? [];
  const exact = rows.find((r) => r.path.toLowerCase() === category.trim().toLowerCase());
  return (exact ?? rows[0]).fields ?? [];
}

export function categoryHasMinedBrands(category: string): boolean {
  return brandsForFormCategory(category).length > 0;
}
