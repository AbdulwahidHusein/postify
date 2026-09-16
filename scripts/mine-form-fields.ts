/**
 * Mine Brand / Make / Model (+ other select fields) from Jiji create-ad form_fields.
 *
 * Endpoint (needs a logged-in session cookie):
 *   GET /api_web/v1/item-create/form_fields.json?advert_id=…&category_id=…&title=…
 *
 * - title=Item  → Brand/Make lists (+ static selects like Condition)
 * - title=<Brand> → Model list for that brand/make
 *
 * Usage:
 *   JIJI_COOKIE='uid=…; app=…' npx tsx scripts/mine-form-fields.ts
 *   JIJI_COOKIE='…' npx tsx scripts/mine-form-fields.ts --brands-only
 *   JIJI_COOKIE='…' npx tsx scripts/mine-form-fields.ts --models-only
 *   JIJI_COOKIE='…' npx tsx scripts/mine-form-fields.ts --slug=mobile-phones
 *
 * Speed knobs:
 *   MINE_CONCURRENCY=16   parallel model fetches (default 16)
 *   MINE_SAVE_EVERY=50    flush to disk every N model results (default 50)
 *   MINE_DELAY=0          pause between scheduling batches (default 0)
 *
 * Resumable: re-runs skip brands already present in modelsByBrand (even if []).
 */
import dns from "node:dns";
import { rename, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_CATEGORIES = path.join(ROOT, "categories.json");
const OUT = path.join(ROOT, "src/lib/catalog/form-fields.json");
const API =
  "https://jiji.com.et/api_web/v1/item-create/form_fields.json";
const ADVERT_ID = process.env.JIJI_ADVERT_ID ?? "3840477";
const DELAY_MS = Number(process.env.MINE_DELAY ?? 0);
const CONCURRENCY = Math.max(1, Number(process.env.MINE_CONCURRENCY ?? 16));
const SAVE_EVERY = Math.max(1, Number(process.env.MINE_SAVE_EVERY ?? 50));
/** Minimum gap between HTTP calls (all workers share this). */
const MIN_GAP_MS = Math.max(0, Number(process.env.MINE_MIN_GAP_MS ?? 200));
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

type JijiCategory = {
  id: number;
  slug: string;
  name: string;
  childes?: JijiCategory[];
};

type Leaf = {
  id: number;
  slug: string;
  name: string;
  path: string;
  group: string;
};

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

type Output = Record<string, CategoryFormFields>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function leavesFrom(cats: JijiCategory[]): Leaf[] {
  const out: Leaf[] = [];
  function walk(c: JijiCategory, pathParts: string[], group: string) {
    const next = [...pathParts, c.name];
    const kids = c.childes ?? [];
    if (kids.length === 0) {
      out.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        path: next.join(" > "),
        group,
      });
      return;
    }
    for (const ch of kids) walk(ch, next, group);
  }
  for (const c of cats) walk(c, [], c.name);
  return out;
}

type ApiField = {
  name: string;
  label: string;
  input_type: string;
  required?: boolean;
  possible_values?: Array<{ value: string }>;
};

async function fetchFields(
  cookie: string,
  categoryId: number,
  title: string,
  attempt = 1,
): Promise<ApiField[]> {
  const url = new URL(API);
  url.searchParams.set("advert_id", ADVERT_ID);
  url.searchParams.set("category_id", String(categoryId));
  url.searchParams.set("title", title);

  await throttle();

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        Cookie: cookie,
        Referer: "https://jiji.com.et/add-free-ad.html",
      },
    });
    const text = await res.text();
    if (res.status === 429) {
      const backoff = Math.min(120_000, 15_000 * attempt);
      console.warn(`429 rate-limit — sleeping ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
      return fetchFields(cookie, categoryId, title, attempt + 1);
    }
    if (!text?.trim()) {
      throw new Error(
        `form_fields cat=${categoryId} title=${title}: empty body HTTP ${res.status}`,
      );
    }
    let data: {
      status?: string;
      message?: string;
      fields?: ApiField[];
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error(
        `form_fields cat=${categoryId} title=${title}: bad JSON HTTP ${res.status} body=${text.slice(0, 80)}`,
      );
    }
    if (!res.ok || data.status !== "ok" || !data.fields) {
      throw new Error(
        `form_fields cat=${categoryId} title=${title}: HTTP ${res.status} ${data.message ?? data.status}`,
      );
    }
    return data.fields;
  } catch (err) {
    if (attempt < 5) {
      await sleep(1000 * attempt);
      return fetchFields(cookie, categoryId, title, attempt + 1);
    }
    throw err;
  }
}

function parseSelectFields(fields: ApiField[]): FieldValues[] {
  const out: FieldValues[] = [];
  for (const f of fields) {
    if (f.input_type !== "single_select" && f.input_type !== "multi_select") {
      continue;
    }
    const values = (f.possible_values ?? [])
      .map((v) => String(v?.value ?? "").trim())
      .filter(Boolean);
    out.push({
      name: f.label,
      attr: f.name,
      inputType: f.input_type,
      required: Boolean(f.required),
      values,
    });
  }
  return out;
}

function brandInfo(fields: FieldValues[]): {
  brandField: "Brand" | "Make" | null;
  brands: string[];
} {
  const brand = fields.find((f) => f.name === "Brand" && f.values.length);
  if (brand) return { brandField: "Brand", brands: brand.values };
  const make = fields.find((f) => f.name === "Make" && f.values.length);
  if (make) return { brandField: "Make", brands: make.values };
  return { brandField: null, brands: [] };
}

async function loadOut(): Promise<Output> {
  try {
    return JSON.parse(await readFile(OUT, "utf8")) as Output;
  } catch {
    return {};
  }
}

async function saveOut(data: Output) {
  const tmp = `${OUT}.tmp`;
  // Compact JSON = much faster writes on a multi‑MB file.
  await writeFile(tmp, JSON.stringify(data) + "\n", "utf8");
  await rename(tmp, OUT);
}

/** Run async work over items with a fixed concurrency pool. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!, i);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    run(),
  );
  await Promise.all(runners);
}

async function main() {
  const cookie = process.env.JIJI_COOKIE?.trim();
  if (!cookie) {
    console.error(
      "Set JIJI_COOKIE to a logged-in jiji.com.et Cookie header value.",
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const brandsOnly = args.includes("--brands-only");
  const modelsOnly = args.includes("--models-only");
  const slugArg = args.find((a) => a.startsWith("--slug="))?.slice(7);

  const raw = JSON.parse(await readFile(SRC_CATEGORIES, "utf8")) as {
    data: { categories: JijiCategory[] };
  };
  let leaves = leavesFrom(raw.data.categories);
  if (slugArg) leaves = leaves.filter((l) => l.slug === slugArg);

  const out = await loadOut();
  let writes = 0;
  let pending = 0;
  let completed = 0;
  let saving: Promise<void> = Promise.resolve();

  function progress() {
    const totalBrands = Object.values(out).reduce(
      (n, row) => n + (row.brands?.length ?? 0),
      0,
    );
    const modelKeys = Object.values(out).reduce(
      (n, row) => n + Object.keys(row.modelsByBrand ?? {}).length,
      0,
    );
    return { totalBrands, modelKeys };
  }

  function persist(reason: string, force = false) {
    pending += force ? 0 : 1;
    if (!force && pending < SAVE_EVERY) return Promise.resolve();

    const flushCount = pending;
    pending = 0;
    saving = saving.then(async () => {
      writes += 1;
      await saveOut(out);
      const { totalBrands, modelKeys } = progress();
      console.log(
        `saved (${reason}) writes=${writes} modelKeys=${modelKeys}/${totalBrands} done=${completed} flushed≈${flushCount || "force"}`,
      );
    });
    return saving;
  }

  let shuttingDown = false;
  const onSignal = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${sig} — flushing to disk…`);
    try {
      await persist("signal", true);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void onSignal("SIGINT"));
  process.on("SIGTERM", () => void onSignal("SIGTERM"));

  console.log(
    `Leaves=${leaves.length} concurrency=${CONCURRENCY} saveEvery=${SAVE_EVERY} delay=${DELAY_MS}`,
  );
  {
    const { totalBrands, modelKeys } = progress();
    console.log(`Resume checkpoint: ${modelKeys}/${totalBrands} model keys`);
  }

  // Pass 1 — brands / static fields
  if (!modelsOnly) {
    for (const leaf of leaves) {
      const existing = out[leaf.slug];
      if (existing?.brands?.length || existing?.fields?.length) {
        continue;
      }
      try {
        const fields = parseSelectFields(
          await fetchFields(cookie, leaf.id, "Item"),
        );
        const { brandField, brands } = brandInfo(fields);
        out[leaf.slug] = {
          categoryId: leaf.id,
          slug: leaf.slug,
          path: leaf.path,
          group: leaf.group,
          fields: fields.filter((f) => f.name !== "Model"),
          brands,
          brandField,
          modelsByBrand: existing?.modelsByBrand ?? {},
        };
        console.log(
          `brands ${leaf.slug}: ${brands.length} ${brandField ?? "—"}`,
        );
        await persist(`brands:${leaf.slug}`, true);
      } catch (err) {
        console.error(`FAIL brands ${leaf.slug}`, err);
      }
      if (DELAY_MS) await sleep(DELAY_MS);
    }
    await persist("brands-pass-done", true);
  }

  // Pass 2 — models per brand/make (parallel + batched saves)
  if (!brandsOnly) {
    type Job = { slug: string; categoryId: number; brand: string };
    const jobs: Job[] = [];
    for (const leaf of leaves) {
      const entry = out[leaf.slug];
      if (!entry?.brands?.length) continue;
      for (const brand of entry.brands) {
        if (Object.prototype.hasOwnProperty.call(entry.modelsByBrand, brand)) {
          continue;
        }
        jobs.push({ slug: leaf.slug, categoryId: leaf.id, brand });
      }
    }
    console.log(`Model jobs remaining: ${jobs.length}`);

    await mapPool(jobs, CONCURRENCY, async (job) => {
      if (shuttingDown) return;
      const entry = out[job.slug];
      if (!entry) return;
      // Another worker may have filled it (shouldn't, but safe).
      if (Object.prototype.hasOwnProperty.call(entry.modelsByBrand, job.brand)) {
        return;
      }
      try {
        const fields = parseSelectFields(
          await fetchFields(cookie, job.categoryId, job.brand),
        );
        const model = fields.find((f) => f.name === "Model");
        entry.modelsByBrand[job.brand] = model?.values ?? [];
        if ((completed + 1) % 100 === 0) {
          console.log(
            `… ${job.slug} / ${job.brand}: ${entry.modelsByBrand[job.brand].length} (${completed + 1}/${jobs.length})`,
          );
        }
        completed += 1;
        void persist(`models:${job.slug}`);
      } catch (err) {
        // Transient network/rate-limit errors: do NOT mark done, so resume retries.
        console.error(`FAIL models ${job.slug}/${job.brand}`, err);
      }
      if (DELAY_MS) await sleep(DELAY_MS);
    });
  }

  await persist("final", true);
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
