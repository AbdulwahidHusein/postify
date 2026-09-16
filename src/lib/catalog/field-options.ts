/**
 * Fallback brand lists by taxonomy group when mined Brand values are missing.
 * Ethiopia marketplace–oriented.
 */
const BRANDS_BY_GROUP: Record<string, string[]> = {
  "Phones & Tablets": [
    "Samsung",
    "Apple",
    "Xiaomi",
    "Huawei",
    "Tecno",
    "Infinix",
    "Oppo",
    "Vivo",
    "Nokia",
    "Realme",
    "Google",
    "OnePlus",
    "Honor",
    "Itel",
  ],
  Vehicles: [
    "Toyota",
    "Hyundai",
    "Suzuki",
    "Honda",
    "Nissan",
    "Mazda",
    "Mitsubishi",
    "Ford",
    "Kia",
    "Isuzu",
    "Volkswagen",
    "Mercedes-Benz",
    "BMW",
    "Lifan",
    "Chery",
  ],
  Electronics: [
    "Samsung",
    "LG",
    "Sony",
    "Apple",
    "HP",
    "Dell",
    "Lenovo",
    "Asus",
    "Huawei",
    "Xiaomi",
    "Canon",
    "Epson",
    "TP-Link",
  ],
  Fashion: [
    "Nike",
    "Adidas",
    "Puma",
    "Zara",
    "H&M",
    "Gucci",
    "Shein",
    "Local",
  ],
};

export const COMMON_CONDITIONS = [
  "Brand New",
  "New",
  "Local Used",
  "Foreign Used",
  "Ethiopian Used",
  "Used",
  "Like New",
  "Good",
  "Fair",
  "Refurbished",
];

export function brandsForCategory(category: string): string[] {
  const group = category.split(">")[0]?.trim() ?? "";
  return BRANDS_BY_GROUP[group] ?? [];
}

export function mergeOptions(
  ...lists: Array<string[] | undefined | null>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const v = raw.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
