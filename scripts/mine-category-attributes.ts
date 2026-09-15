/**
 * Mine category attributes from Jiji Ethiopia listings.
 *
 * For each leaf category in categories.json, fetches several pages of live
 * listings and collects the structured attributes (Brand, Condition, Size,
 * Transmission, etc.) with frequency counts. Output is written to
 * src/lib/catalog/category-attributes.json for use as dropdown suggestions.
 *
 * Also generates:
 *   - src/lib/catalog/taxonomy-data.ts  (from categories.json)
 *   - src/lib/catalog/regions-data.ts   (from regions.json)
 *
 * Usage:
 *   npx tsx scripts/mine-category-attributes.ts [--pages=5] [--delay=300]
 *
 * Resumable: re-running skips categories already present in the output file.
 */
import dns from "node:dns";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

dns.setDefaultResultOrder("ipv4first");

// ── Config ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_PAGES = Number(process.env.MINE_PAGES ?? 5);
const DELAY_MS = Number(process.env.MINE_DELAY ?? 300);
const API = "https://jiji.com.et/api_web/v1/listing";
const UA = "Mozilla/5.0 (compatible; PostifyCatalogMiner/1.0)";
const PER_PAGE = 20;

const OUT_ATTRS = path.join(ROOT, "src/lib/catalog/category-attributes.json");
const OUT_TAXONOMY = path.join(ROOT, "src/lib/catalog/taxonomy-data.ts");
const OUT_REGIONS = path.join(ROOT, "src/lib/catalog/regions-data.ts");
const SRC_CATEGORIES = path.join(ROOT, "categories.json");
const SRC_REGIONS = path.join(ROOT, "regions.json");

// ── Types ─────────────────────────────────────────────────────────────────

type JijiCategory = {
  id: number;
  parent_id: number | null;
  slug: string;
  name: string;
  childes?: JijiCategory[];
  listing_on_top_lvl?: boolean;
};

type LeafCategory = {
  id: number;
  slug: string;
  name: string;
  path: string; // "Vehicles > Cars"
  group: string; // top-level name
};

type AttrValueCount = { value: string; count: number };

type CategoryAttribute = {
  name: string;
  unit: string | null;
  values: AttrValueCount[];
};

type CategoryAttributes = {
  path: string;
  categoryId: number;
  group: string;
  advertCount: number | null;
  sampledCount: number;
  attributes: CategoryAttribute[];
};

type AttributesOutput = Record<string, CategoryAttributes>;

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson<T>(file: string): Promise<T> {
  return readFile(file, "utf8").then((t) => JSON.parse(t) as T);
}

function findLeaves(cats: JijiCategory[]): LeafCategory[] {
  const leaves: LeafCategory[] = [];
  function walk(c: JijiCategory, path: string[], group: string) {
    const p = [...path, c.name];
    if (!c.childes || c.childes.length === 0) {
      leaves.push({ id: c.id, slug: c.slug, name: c.name, path: p.join(" > "), group });
    }
    for (const ch of c.childes ?? []) walk(ch, p, group);
  }
  for (const c of cats) walk(c, [], c.name);
  return leaves;
}

// ── Mining ────────────────────────────────────────────────────────────────

type JijiAdvert = {
  attrs?: Array<{ name: string; value: string | number; unit: string | null }>;
};

type JijiListingResponse = {
  adverts_list?: {
    count?: number;
    total_pages?: number;
    adverts?: JijiAdvert[];
  };
};

async function fetchListingPage(
  slug: string,
  page: number,
): Promise<JijiListingResponse | null> {
  const url = `${API}?slug=${encodeURIComponent(slug)}&init_page=true&webp=true&page=${page}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return (await res.json()) as JijiListingResponse;
  } catch {
    return null;
  }
}

async function mineCategory(
  leaf: LeafCategory,
): Promise<CategoryAttributes | null> {
  const attrMap = new Map<string, Map<string, number>>();
  const attrUnit = new Map<string, string | null>();
  let advertCount: number | null = null;
  let sampled = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchListingPage(leaf.slug, page);
    if (!data?.adverts_list) break;

    if (advertCount === null) {
      advertCount = data.adverts_list.count ?? null;
    }

    const adverts = data.adverts_list.adverts ?? [];
    if (adverts.length === 0) break;

    for (const advert of adverts) {
      for (const attr of advert.attrs ?? []) {
        const name = attr.name?.trim();
        if (!name || name === "undefined") continue;
        const value = String(attr.value).trim();
        if (!value) continue;

        if (!attrMap.has(name)) attrMap.set(name, new Map());
        const values = attrMap.get(name)!;
        values.set(value, (values.get(value) ?? 0) + 1);

        if (!attrUnit.has(name)) attrUnit.set(name, attr.unit ?? null);
      }
    }

    sampled += adverts.length;

    const totalPages = data.adverts_list.total_pages ?? 0;
    if (page >= totalPages || adverts.length < PER_PAGE) break;

    await sleep(DELAY_MS);
  }

  const attributes: CategoryAttribute[] = [];
  for (const [name, values] of attrMap) {
    const sorted = [...values.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
    attributes.push({
      name,
      unit: attrUnit.get(name) ?? null,
      values: sorted,
    });
  }
  attributes.sort((a, b) => b.values.length - a.values.length);

  return {
    path: leaf.path,
    categoryId: leaf.id,
    group: leaf.group,
    advertCount,
    sampledCount: sampled,
    attributes,
  };
}

async function loadExisting(): Promise<AttributesOutput> {
  try {
    const text = await readFile(OUT_ATTRS, "utf8");
    return JSON.parse(text) as AttributesOutput;
  } catch {
    return {};
  }
}

// ── Taxonomy generation ───────────────────────────────────────────────────

function generateTaxonomyTs(cats: JijiCategory[]): string {
  type Entry = {
    id: number;
    slug: string;
    name: string;
    path: string;
    group: string;
  };

  const entries: Entry[] = [];
  function walk(c: JijiCategory, path: string[], group: string) {
    const p = [...path, c.name];
    entries.push({
      id: c.id,
      slug: c.slug,
      name: c.name,
      path: p.join(" > "),
      group,
    });
    for (const ch of c.childes ?? []) walk(ch, p, group);
  }
  for (const c of cats) walk(c, [], c.name);

  const groups: { group: string; categories: string[] }[] = [];
  const groupMap = new Map<string, string[]>();
  for (const e of entries) {
    if (!groupMap.has(e.group)) groupMap.set(e.group, []);
    groupMap.get(e.group)!.push(e.path);
  }
  for (const [group, categories] of groupMap) {
    groups.push({ group, categories });
  }

  const entriesJson = JSON.stringify(entries, null, 2);
  const groupsJson = JSON.stringify(groups, null, 2);

  return `// AUTO-GENERATED by scripts/mine-category-attributes.ts — do not edit by hand.
// Source: categories.json (Jiji Ethiopia taxonomy, 17 top-level groups)

export type TaxonomyEntry = {
  id: number;
  slug: string;
  name: string;
  path: string;
  group: string;
};

export const TAXONOMY_ENTRIES: TaxonomyEntry[] = ${entriesJson};

export const TAXONOMY_GROUPS: { group: string; categories: string[] }[] = ${groupsJson};

/** All category paths as flat strings (\"Vehicles > Cars\") for search/validation. */
export const ALL_TAXONOMY_CATEGORIES: string[] = TAXONOMY_ENTRIES.map((e) => e.path);

/** Look up a taxonomy entry by its path label. */
export function taxonomyEntryByPath(path: string): TaxonomyEntry | undefined {
  return TAXONOMY_ENTRIES.find((e) => e.path === path);
}

/** Look up a taxonomy entry by its Jiji slug. */
export function taxonomyEntryBySlug(slug: string): TaxonomyEntry | undefined {
  return TAXONOMY_ENTRIES.find((e) => e.slug === slug);
}
`;
}

// ── Regions generation ───────────────────────────────────────────────────

type JijiRegion = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  parent_ids: number[];
  is_popular: boolean;
};

function generateRegionsTs(regions: JijiRegion[]): string {
  const regionsJson = JSON.stringify(regions, null, 2);
  return `// AUTO-GENERATED by scripts/mine-category-attributes.ts — do not edit by hand.
// Source: regions.json (Jiji Ethiopia regions/cities)

export type Region = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  parent_ids: number[];
  is_popular: boolean;
};

export const REGIONS: Region[] = ${regionsJson};

/** Top-level regions (parent_id is null). */
export const TOP_REGIONS: Region[] = REGIONS.filter((r) => r.parent_id === null);

/** Cities/areas under a given parent region id. */
export function regionsByParent(parentId: number): Region[] {
  return REGIONS.filter((r) => r.parent_id === parentId);
}

/** Search regions by name (case-insensitive substring). */
export function searchRegions(query: string, limit = 20): Region[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOP_REGIONS.slice(0, limit);
  return REGIONS.filter((r) => r.name.toLowerCase().includes(q)).slice(0, limit);
}
`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlySlug = onlyArg ? onlyArg.slice(7) : null;

  // 1. Generate taxonomy + regions (always — fast, from local JSON)
  console.log("[taxonomy] Generating from categories.json…");
  const catData = await readJson<{ data: { categories: JijiCategory[] } }>(
    SRC_CATEGORIES,
  );
  const cats = catData.data.categories;
  const taxonomyTs = generateTaxonomyTs(cats);
  await writeFile(OUT_TAXONOMY, taxonomyTs + "\n");
  console.log(`[taxonomy] Wrote ${OUT_TAXONOMY} (${cats.length} top-level)`);

  try {
    console.log("[regions] Generating from regions.json…");
    const regionData = await readJson<{ regions: JijiRegion[] }>(SRC_REGIONS);
    const regionsTs = generateRegionsTs(regionData.regions);
    await writeFile(OUT_REGIONS, regionsTs + "\n");
    console.log(
      `[regions] Wrote ${OUT_REGIONS} (${regionData.regions.length} regions)`,
    );
  } catch {
    console.log("[regions] regions.json not found — skipping");
  }

  // 2. Mine attributes from Jiji API
  const leaves = findLeaves(cats);
  console.log(
    `[mine] ${leaves.length} leaf categories, ${MAX_PAGES} pages each, ${DELAY_MS}ms delay`,
  );

  const existing = force ? {} : await loadExisting();
  const output: AttributesOutput = { ...existing };

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const leaf of leaves) {
    if (onlySlug && leaf.slug !== onlySlug) continue;
    done++;

    if (!force && output[leaf.slug]) {
      skipped++;
      continue;
    }

    const label = `[${done}/${leaves.length}] ${leaf.slug} (${leaf.path})`;
    process.stdout.write(`${label} … `);

    try {
      const result = await mineCategory(leaf);
      if (result && (result.sampledCount > 0 || result.advertCount)) {
        output[leaf.slug] = result;
        const attrNames = result.attributes.map((a) => a.name).join(", ") || "none";
        console.log(
          `${result.sampledCount} ads, ${result.advertCount ?? 0} total · ${attrNames}`,
        );
      } else {
        console.log("no listings");
      }

      // Incremental save every 10 categories
      if (done % 10 === 0) {
        await writeFile(OUT_ATTRS, JSON.stringify(output, null, 2) + "\n");
      }
    } catch (err) {
      failed++;
      console.log(`ERROR: ${err instanceof Error ? err.message : "failed"}`);
    }

    if (done < leaves.length) await sleep(DELAY_MS);
  }

  await writeFile(OUT_ATTRS, JSON.stringify(output, null, 2) + "\n");

  const mined = Object.keys(output).length;
  console.log(
    `\n[done] Mined ${mined} categories (${skipped} skipped, ${failed} failed) → ${OUT_ATTRS}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
