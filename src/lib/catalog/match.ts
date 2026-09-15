import "server-only";

import { ALL_TAXONOMY_CATEGORIES } from "@/lib/catalog/taxonomy-data";

/**
 * Fuzzy-match a free-text category (from the LLM or a seller) against the
 * 231-category taxonomy. Returns the best taxonomy path or null.
 *
 * This runs locally — the LLM never sees the full taxonomy list, so we keep
 * the prompt small and the matching deterministic.
 */
export function matchCategoryToTaxonomy(
  raw: string | null | undefined,
): string | null {
  const q = raw?.trim();
  if (!q) return null;

  const lower = q.toLowerCase();

  // Exact match
  const exact = ALL_TAXONOMY_CATEGORIES.find(
    (c) => c.toLowerCase() === lower,
  );
  if (exact) return exact;

  // Match the leaf (last segment after ">")
  const leaf = lower.split(">").pop()?.trim() ?? lower;
  const leafMatch = ALL_TAXONOMY_CATEGORIES.find((c) => {
    const cLeaf = c.toLowerCase().split(">").pop()?.trim() ?? "";
    return cLeaf === leaf;
  });
  if (leafMatch) return leafMatch;

  // Substring scoring: how many query tokens appear in the category path
  const tokens = lower.split(/[\s>]+/).filter((t) => t.length >= 2);
  let best: { path: string; score: number } | null = null;

  for (const cat of ALL_TAXONOMY_CATEGORIES) {
    const catLower = cat.toLowerCase();
    let score = 0;

    // Full path starts with query
    if (catLower.startsWith(lower)) score += 60;
    // Query starts with full path (query is more specific)
    else if (lower.startsWith(catLower)) score += 30;

    // Leaf matches
    const catLeaf = catLower.split(">").pop()?.trim() ?? "";
    if (catLeaf === leaf) score += 40;
    else if (catLeaf.startsWith(leaf)) score += 25;
    else if (leaf.startsWith(catLeaf)) score += 15;
    else if (catLeaf.includes(leaf) || leaf.includes(catLeaf)) score += 10;

    // Token overlap
    for (const token of tokens) {
      if (catLower.includes(token)) score += 5;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { path: cat, score };
    }
  }

  // Only return if we have a reasonable match
  return best && best.score >= 15 ? best.path : null;
}
