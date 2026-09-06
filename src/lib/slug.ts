import { createHash } from "node:crypto";

const SLUG_MAX = 48;

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);

  return base || "shop";
}

export function uniqueSlugHint(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 6);
  return hash;
}
