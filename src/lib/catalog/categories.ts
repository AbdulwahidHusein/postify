/**
 * Public category taxonomy API.
 *
 * Backed by generated data from categories.json (Jiji Ethiopia taxonomy):
 * 17 top-level groups, 231 categories total.
 * See scripts/mine-category-attributes.ts to regenerate.
 */
import {
  ALL_TAXONOMY_CATEGORIES,
  TAXONOMY_GROUPS,
} from "@/lib/catalog/taxonomy-data";

export type CategoryGroup = {
  group: string;
  categories: string[];
};

// Backward-compatible re-exports from the generated taxonomy.
export const CATEGORY_GROUPS: CategoryGroup[] = TAXONOMY_GROUPS;
export const ALL_CATEGORIES: string[] = ALL_TAXONOMY_CATEGORIES;

export function searchCategories(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return ALL_CATEGORIES.slice(0, limit);
  }
  const scored = ALL_CATEGORIES.map((label) => {
    const lower = label.toLowerCase();
    let score = 0;
    if (lower === q) score = 100;
    else if (lower.startsWith(q)) score = 80;
    else if (lower.includes(`> ${q}`)) score = 70;
    else if (lower.includes(q)) score = 50;
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.every((t) => lower.includes(t))) score = 40;
    }
    return { label, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return scored.slice(0, limit).map((x) => x.label);
}

export function categoryGroupOf(label: string): string | null {
  for (const group of CATEGORY_GROUPS) {
    if (group.categories.includes(label)) return group.group;
  }
  return null;
}
