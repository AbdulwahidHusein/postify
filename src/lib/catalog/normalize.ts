/** Shared catalog string normalization for suggest + reconcile. */

export function normalizeCatalogKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function catalogTokens(value: string): string[] {
  const n = normalizeCatalogKey(value);
  return n ? n.split(" ") : [];
}
