import "server-only";

import { attributesForCategory } from "@/lib/catalog/attributes";
import {
  brandsForFormCategory,
  formFieldsForCategory,
  modelsForBrand,
} from "@/lib/catalog/form-fields";
import { COMMON_CONDITIONS } from "@/lib/catalog/field-options";
import { catalogTokens, normalizeCatalogKey } from "@/lib/catalog/normalize";
import {
  TAXONOMY_ENTRIES,
  type TaxonomyEntry,
} from "@/lib/catalog/taxonomy-data";

export type MatchHit = {
  value: string;
  score: number;
};

export type CategoryMatch = {
  path: string;
  slug: string;
  score: number;
};

export type ReconcileInput = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  attributes?: Record<string, string> | null;
  preferredCategories?: string[];
};

export type ReconcileResult = {
  category: string | null;
  categorySlug: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  attributes: Record<string, string>;
  scores: {
    category: number;
    brand: number;
    model: number;
    condition: number;
  };
};

const SUGGEST_DEFAULT_LIMIT = 30;
const BRAND_INLINE_CAP = 300;
/** Reject weak fuzzy hits below this. */
const MIN_ACCEPT = 0.55;

export { BRAND_INLINE_CAP };

function scoreCandidate(query: string, candidate: string): number {
  const q = normalizeCatalogKey(query);
  const c = normalizeCatalogKey(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q)) return 0.92;
  if (q.startsWith(c) && c.length >= 3) return 0.85;
  if (c.includes(q)) return 0.78;
  if (q.includes(c) && c.length >= 3) return 0.72;

  const qt = catalogTokens(query);
  const ct = new Set(catalogTokens(candidate));
  if (!qt.length || !ct.size) return 0;
  let hit = 0;
  for (const t of qt) {
    if (ct.has(t)) {
      hit += 1;
      continue;
    }
    for (const cTok of ct) {
      if (cTok.startsWith(t) || t.startsWith(cTok)) {
        hit += 0.6;
        break;
      }
    }
  }
  const overlap = hit / Math.max(qt.length, ct.size);
  return overlap >= 0.5 ? 0.55 + overlap * 0.2 : overlap * 0.5;
}

/** Rank options by fuzzy score; empty q returns the first `limit` items. */
export function suggestFromList(
  options: string[],
  q: string,
  limit = SUGGEST_DEFAULT_LIMIT,
): MatchHit[] {
  const trimmed = q.trim();
  if (!trimmed) {
    return options.slice(0, limit).map((value) => ({ value, score: 1 }));
  }

  const scored: MatchHit[] = [];
  for (const value of options) {
    const score = scoreCandidate(trimmed, value);
    if (score <= 0) continue;
    scored.push({ value, score });
  }
  scored.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
  return scored.slice(0, limit);
}

export function bestMatch(
  options: string[],
  query: string | null | undefined,
  minScore = MIN_ACCEPT,
): MatchHit | null {
  if (!query?.trim() || !options.length) return null;
  const hits = suggestFromList(options, query, 5);
  const top = hits[0];
  if (!top || top.score < minScore) return null;
  return top;
}

function preferredBoost(
  entry: TaxonomyEntry,
  preferred: string[] | undefined,
): number {
  if (!preferred?.length) return 0;
  const pathN = normalizeCatalogKey(entry.path);
  const leafN = normalizeCatalogKey(entry.name);
  for (const p of preferred) {
    const pn = normalizeCatalogKey(p);
    if (!pn) continue;
    if (pn === pathN || pn === leafN) return 0.15;
    if (pathN.includes(pn) || pn.includes(leafN)) return 0.08;
  }
  return 0;
}

export function reconcileCategory(
  query: string | null | undefined,
  preferredCategories?: string[],
): CategoryMatch | null {
  if (!query?.trim()) return null;

  // Exact path / slug first
  const trimmed = query.trim();
  const byPath = TAXONOMY_ENTRIES.find((e) => e.path === trimmed);
  if (byPath) {
    return { path: byPath.path, slug: byPath.slug, score: 1 };
  }
  const bySlug = TAXONOMY_ENTRIES.find(
    (e) => e.slug === trimmed.toLowerCase(),
  );
  if (bySlug) {
    return { path: bySlug.path, slug: bySlug.slug, score: 1 };
  }

  const scored: CategoryMatch[] = [];
  for (const entry of TAXONOMY_ENTRIES) {
    const leafScore = scoreCandidate(trimmed, entry.name);
    const pathScore = scoreCandidate(trimmed, entry.path);
    const base = Math.max(leafScore, pathScore * 0.95);
    if (base <= 0) continue;
    const score = Math.min(1, base + preferredBoost(entry, preferredCategories));
    scored.push({ path: entry.path, slug: entry.slug, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < MIN_ACCEPT) return null;
  return top;
}

export function suggestBrands(
  category: string,
  q: string,
  limit = SUGGEST_DEFAULT_LIMIT,
): MatchHit[] {
  return suggestFromList(brandsForFormCategory(category), q, limit);
}

export function suggestModels(
  category: string,
  brand: string,
  q: string,
  limit = SUGGEST_DEFAULT_LIMIT,
): MatchHit[] {
  return suggestFromList(modelsForBrand(category, brand), q, limit);
}

/**
 * Map free-text extract onto canonical catalog values.
 * Never loads the full catalog into the LLM — pure local matching.
 */
export function reconcileListing(input: ReconcileInput): ReconcileResult {
  const cat = reconcileCategory(input.category, input.preferredCategories);
  const categoryPath = cat?.path ?? null;
  const categorySlug = cat?.slug ?? null;

  const brands = categoryPath ? brandsForFormCategory(categoryPath) : [];
  const brandHit = bestMatch(brands, input.brand);
  const brand = brandHit?.value ?? (input.brand?.trim() || null);

  const models =
    categoryPath && brandHit
      ? modelsForBrand(categoryPath, brandHit.value)
      : [];
  const modelHit = bestMatch(models, input.model);
  const model = modelHit?.value ?? (input.model?.trim() || null);

  const form = categoryPath ? formFieldsForCategory(categoryPath) : null;
  const conditionField = form?.fields.find((f) => f.name === "Condition");
  const conditionOptions = [
    ...(conditionField?.values ?? []),
    ...COMMON_CONDITIONS,
  ];
  const conditionHit = bestMatch(conditionOptions, input.condition);
  const condition =
    conditionHit?.value ?? (input.condition?.trim() || null);

  const attributes: Record<string, string> = {};
  const freeAttrs = input.attributes ?? {};
  if (categoryPath && Object.keys(freeAttrs).length) {
    const listingAttrs = attributesForCategory(categoryPath);
    const formFields = (form?.fields ?? []).filter(
      (f) => !["Brand", "Make", "Model", "Condition"].includes(f.name),
    );
    const attrDefs = [
      ...listingAttrs.map((a) => ({
        name: a.name,
        values: a.values,
      })),
      ...formFields.map((f) => ({
        name: f.name,
        values: f.values,
      })),
    ];

    for (const [rawKey, rawVal] of Object.entries(freeAttrs)) {
      if (!rawVal?.trim()) continue;
      const keyHit = bestMatch(
        attrDefs.map((a) => a.name),
        rawKey,
        0.6,
      );
      if (!keyHit) continue;
      const def = attrDefs.find((a) => a.name === keyHit.value);
      if (!def) continue;
      const valHit =
        def.values.length > 0
          ? bestMatch(def.values, rawVal, 0.55)
          : null;
      attributes[keyHit.value] = valHit?.value ?? rawVal.trim().slice(0, 120);
    }
  }

  return {
    category: categoryPath ?? (input.category?.trim() || null),
    categorySlug,
    brand,
    model,
    condition,
    attributes,
    scores: {
      category: cat?.score ?? 0,
      brand: brandHit?.score ?? 0,
      model: modelHit?.score ?? 0,
      condition: conditionHit?.score ?? 0,
    },
  };
}
