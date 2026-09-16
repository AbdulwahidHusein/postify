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

export function formFieldsForCategory(category: string): CategoryFormFields | null {
  const slug = resolveSlug(category);
  if (!slug) return null;
  return DATA[slug] ?? null;
}

export function brandsForFormCategory(category: string): string[] {
  return formFieldsForCategory(category)?.brands ?? [];
}

export function modelsForBrand(
  category: string,
  brand: string,
): string[] {
  const row = formFieldsForCategory(category);
  if (!row || !brand.trim()) return [];
  return row.modelsByBrand[brand.trim()] ?? [];
}

export function selectFieldsForCategory(category: string): FieldValues[] {
  return formFieldsForCategory(category)?.fields ?? [];
}
