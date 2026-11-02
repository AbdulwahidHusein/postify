export type ParsedListing = {
  isProduct: boolean;
  confidence: number;
  title: string;
  description: string;
  price: number | null;
  compareAtPrice: number | null;
  currency: string | null;
  category: string | null;
  tags: string[];
  sku: string | null;
  condition: string | null;
  brand: string | null;
  model: string | null;
  location: string | null;
  isNegotiable: boolean;
  /** Optional clean slug stem; still made unique on insert. */
  slugHint: string | null;
  source: "gemini" | "heuristic";
};

const NUM = String.raw`(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const CUR = String.raw`(etb|birr|br\.?|ብር|\$|usd|eur|€)`;
const AFTER = new RegExp(`${NUM}\\s*${CUR}`, "i");
const BEFORE = new RegExp(`${CUR}\\s*${NUM}`, "i");
const KEYWORD = new RegExp(`(?:price|ዋጋ|cost)\\s*[:\\-=]?\\s*${NUM}`, "i");
const BARE = /(?:^|[\s:])(\d{1,3}(?:,\d{3})+|\d{3,9})(?=\s|$|[.!])/g;
const PHONE = /(?:\+?251|0)[79]\d{8}/g;
const NEGOTIABLE = /negotiable|ዋጋ\s*ይደረጋል|ድርድር|obo|or best offer/i;

function toNumber(whole: string, frac?: string) {
  const n = Number(whole.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return frac ? Number(`${n}.${frac}`) : n;
}

function currencyOf(token: string | undefined, fallback: string) {
  const t = (token ?? "").toLowerCase();
  if (t === "$" || t === "usd") return "USD";
  if (t === "€" || t === "eur") return "EUR";
  return t ? "ETB" : fallback;
}

type PriceHit = { price: number; currency: string; phrase: string; strong: boolean };

export function findPrice(text: string, fallbackCurrency = "ETB"): PriceHit | null {
  const clean = text.replace(PHONE, " ");
  let m = AFTER.exec(clean);
  if (m) {
    const price = toNumber(m[1], m[2]);
    if (price !== null) return { price, currency: currencyOf(m[3], fallbackCurrency), phrase: m[0], strong: true };
  }
  m = BEFORE.exec(clean);
  if (m) {
    const price = toNumber(m[2], m[3]);
    if (price !== null) return { price, currency: currencyOf(m[1], fallbackCurrency), phrase: m[0], strong: true };
  }
  m = KEYWORD.exec(clean);
  if (m) {
    const price = toNumber(m[1], m[2]);
    if (price !== null) return { price, currency: fallbackCurrency, phrase: m[0], strong: true };
  }
  const bare = [...clean.matchAll(BARE)];
  const last = bare.at(-1);
  if (last) {
    const price = toNumber(last[1]);
    if (price !== null && price >= 100) {
      return { price, currency: fallbackCurrency, phrase: last[1], strong: false };
    }
  }
  return null;
}

/**
 * Free rule-based parser: used when the AI is not configured or a cost limit
 * was reached. Conservative by design; low-confidence results stay drafts.
 */
export function parseListingCaption(
  caption: string,
  opts?: { defaultCurrency?: string; hasMedia?: boolean },
): ParsedListing {
  const raw = caption.trim();
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const hasMedia = Boolean(opts?.hasMedia);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = raw ? findPrice(raw, defaultCurrency) : null;

  const strip = (line: string) =>
    (hit ? line.replace(hit.phrase, " ") : line)
      .replace(/(?:price|ዋጋ)\s*[:\-=]?\s*$/i, "")
      .replace(/[\s:\-–|•·]+$/g, "")
      .replace(/^[\s:\-–|•·]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  let title = lines.length ? strip(lines[0]) : "";
  let rest = lines.slice(1);
  if (!title && rest.length) {
    title = strip(rest[0]);
    rest = rest.slice(1);
  }
  const description = rest
    .filter((l) => !(hit && strip(l) === "" && l.includes(hit.phrase)))
    .join("\n")
    .trim();

  const price = hit?.price ?? null;
  const isProduct = hasMedia || price !== null;
  const confidence =
    hit?.strong && hasMedia ? 0.85 : hit && hasMedia ? 0.65 : hasMedia ? 0.7 : hit?.strong ? 0.6 : hit ? 0.45 : 0.3;

  return {
    isProduct,
    confidence,
    title: (title || (hasMedia ? "New listing" : "Untitled")).slice(0, 120),
    description: description.slice(0, 4000),
    price,
    compareAtPrice: null,
    currency: hit?.currency ?? defaultCurrency,
    category: null,
    tags: [],
    sku: null,
    condition: null,
    brand: null,
    model: null,
    location: null,
    isNegotiable: NEGOTIABLE.test(raw),
    slugHint: null,
    source: "heuristic",
  };
}
