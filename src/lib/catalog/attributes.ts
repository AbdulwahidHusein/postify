import "server-only";

import minedData from "@/lib/catalog/category-attributes.json";
import {
  ALL_TAXONOMY_CATEGORIES,
  taxonomyEntryByPath,
} from "@/lib/catalog/taxonomy-data";

type MinedValue = { value: string; count: number };
type MinedAttribute = {
  name: string;
  unit: string | null;
  values: MinedValue[];
};
type MinedCategory = {
  path: string;
  categoryId: number;
  group: string;
  advertCount: number | null;
  sampledCount: number;
  attributes: MinedAttribute[];
};

const MINED = minedData as Record<string, MinedCategory>;

export type AttributeSuggestion = {
  name: string;
  unit: string | null;
  values: string[];
};

/** Resolve a category (taxonomy path OR free text) to a mined-data slug. */
export function slugForCategory(category: string): string | null {
  const trimmed = category?.trim();
  if (!trimmed) return null;

  // Exact taxonomy path → slug
  const entry = taxonomyEntryByPath(trimmed);
  if (entry) return entry.slug;

  // Fuzzy: match the leaf name against taxonomy leaves, then check mined data
  const lower = trimmed.toLowerCase();
  const leaf = lower.split(">").pop()?.trim() ?? lower;

  // Try direct slug match (caller passed a slug)
  if (MINED[lower]) return lower;
  if (MINED[trimmed]) return trimmed;

  // Match taxonomy leaf
  const match = ALL_TAXONOMY_CATEGORIES.find((c) => {
    const cLeaf = c.toLowerCase().split(">").pop()?.trim() ?? "";
    return cLeaf === leaf || cLeaf === lower;
  });
  if (match) {
    const e = taxonomyEntryByPath(match);
    if (e) return e.slug;
  }
  return null;
}

/**
 * Returns structured attribute suggestions for a category (taxonomy path or
 * free text). Server-only — the client fetches this via /api/catalog/attributes
 * so the mined JSON is never shipped to the browser.
 */
export function attributesForCategory(
  category: string,
): AttributeSuggestion[] {
  const slug = slugForCategory(category);
  if (!slug) return [];
  const mined = MINED[slug];
  if (!mined) return [];
  return mined.attributes.map((a) => ({
    name: a.name,
    unit: a.unit,
    values: a.values.map((v) => v.value),
  }));
}

/** Common condition values across mined categories (deduped by frequency). */
export function commonConditions(): string[] {
  const counts = new Map<string, number>();
  for (const cat of Object.values(MINED)) {
    for (const attr of cat.attributes) {
      if (attr.name.toLowerCase() === "condition") {
        for (const v of attr.values) {
          counts.set(v.value, (counts.get(v.value) ?? 0) + v.count);
        }
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}

