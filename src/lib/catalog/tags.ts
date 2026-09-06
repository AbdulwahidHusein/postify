/** Suggested product tags for marketplace listings (searchable chips). */
export const SUGGESTED_TAGS: string[] = [
  // condition / listing
  "new",
  "brand new",
  "used",
  "like new",
  "refurbished",
  "open box",
  "sealed",
  "original",
  "genuine",
  "replica",
  "limited edition",
  "rare",
  "hot deal",
  "clearance",
  "on sale",
  "bundle",
  "wholesale",
  "retail",
  "pre-order",
  "in stock",
  "low stock",
  "made to order",

  // fashion
  "men",
  "women",
  "unisex",
  "kids",
  "baby",
  "oversized",
  "slim fit",
  "plus size",
  "cotton",
  "leather",
  "denim",
  "wool",
  "silk",
  "vintage",
  "streetwear",
  "formal",
  "casual",
  "sporty",

  // shoes
  "sneakers",
  "running",
  "boots",
  "sandals",
  "heels",
  "size 38",
  "size 39",
  "size 40",
  "size 41",
  "size 42",
  "size 43",
  "size 44",
  "size 45",

  // phones / electronics
  "android",
  "iphone",
  "samsung",
  "xiaomi",
  "tecno",
  "infinix",
  "huawei",
  "pixel",
  "5g",
  "4g",
  "dual sim",
  "unlocked",
  "factory unlocked",
  "wireless",
  "bluetooth",
  "usb-c",
  "fast charging",
  "gaming",
  "laptop",
  "tablet",
  "smartwatch",
  "earbuds",
  "headphones",

  // cards / digital
  "gift card",
  "game card",
  "steam",
  "playstation",
  "xbox",
  "nintendo",
  "itunes",
  "google play",
  "netflix",
  "spotify",
  "pubg",
  "freefire",
  "mobile top-up",
  "airtime",
  "data package",

  // colors
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "gray",
  "brown",
  "gold",
  "silver",
  "multicolor",

  // home / lifestyle
  "kitchen",
  "bedroom",
  "living room",
  "bathroom",
  "office",
  "outdoor",
  "portable",
  "compact",
  "family size",
  "eco-friendly",
  "organic",
  "handmade",
  "imported",
  "local",
  "addis",
  "delivery available",
  "pickup only",
  "cod",
  "cash on delivery",
  "negotiable",
  "fixed price",
];

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,|]/)) {
    const tag = part.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function serializeTags(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(", ");
}

export function searchSuggestedTags(
  query: string,
  selected: string[],
  limit = 24,
): string[] {
  const selectedKeys = new Set(selected.map((t) => t.toLowerCase()));
  const q = query.trim().toLowerCase();
  const pool = SUGGESTED_TAGS.filter((t) => !selectedKeys.has(t.toLowerCase()));
  if (!q) return pool.slice(0, limit);
  return pool
    .filter((t) => t.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.localeCompare(b);
    })
    .slice(0, limit);
}
