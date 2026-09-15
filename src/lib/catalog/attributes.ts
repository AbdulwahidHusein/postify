import minedData from "@/lib/catalog/category-attributes.json";
import { taxonomyEntryByPath } from "@/lib/catalog/taxonomy-data";

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

/** Map a category path (e.g. "Vehicles > Cars") to its slug for lookup. */
function slugForPath(path: string): string | null {
  const entry = taxonomyEntryByPath(path);
  return entry?.slug ?? null;
}

export type AttributeSuggestion = {
  name: string;
  unit: string | null;
  values: string[];
};

/**
 * Returns structured attribute suggestions for a category path.
 * Falls back to an empty list if the category wasn't mined or has no attrs.
 */
export function attributesForCategory(categoryPath: string): AttributeSuggestion[] {
  const slug = slugForPath(categoryPath);
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

/** All distinct attribute names ever mined (for analytics/debugging). */
export function allAttributeNames(): string[] {
  const names = new Set<string>();
  for (const cat of Object.values(MINED)) {
    for (const attr of cat.attributes) {
      names.add(attr.name);
    }
  }
  return [...names].sort();
}
