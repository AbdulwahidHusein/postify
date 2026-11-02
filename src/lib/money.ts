/**
 * Money is stored as integer minor units (santim for ETB) and moved around the
 * server as bigint. JSON responses carry minor units as strings so no precision
 * is lost; the UI formats them with formatMoney.
 */

export const MINOR_PER_MAJOR = 100n;

/** "4,500.50" | 4500.5 → 450050n. Returns null for empty/invalid input. */
export function toMinor(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? value.toString() : value;
  const cleaned = raw.replace(/[,\s]/g, "").trim();
  if (!cleaned) return null;
  const m = /^(-)?(\d+)(?:\.(\d{1,2})\d*)?$/.exec(cleaned);
  if (!m) return null;
  const sign = m[1] ? -1n : 1n;
  const whole = BigInt(m[2]);
  const frac = BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return sign * (whole * MINOR_PER_MAJOR + frac);
}

export function toMajorString(minor: bigint | string | number): string {
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / MINOR_PER_MAJOR;
  const frac = abs % MINOR_PER_MAJOR;
  const fracStr = frac === 0n ? "" : `.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${whole.toString()}${fracStr}`;
}

/** 450050n, "ETB" → "ETB 4,500.50"; whole amounts drop the decimals. */
export function formatMoney(
  minor: bigint | string | number | null | undefined,
  currency = "ETB",
): string | null {
  if (minor === null || minor === undefined || minor === "") return null;
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / MINOR_PER_MAJOR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % MINOR_PER_MAJOR;
  const fracStr = frac === 0n ? "" : `.${frac.toString().padStart(2, "0")}`;
  return `${currency} ${neg ? "-" : ""}${whole}${fracStr}`;
}

export function sumMinor(values: (bigint | null | undefined)[]): bigint {
  return values.reduce<bigint>((acc, v) => acc + (v ?? 0n), 0n);
}
