/**
 * Normalise Ethiopian phone numbers to E.164 (+2519XXXXXXXX / +2517XXXXXXXX).
 * Other international numbers in + form are accepted as-is (8–15 digits).
 * Returns null when the input cannot be a phone number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  const plus = compact.startsWith("+");
  const digits = plus ? compact.slice(1) : compact;

  const et = /^(?:251|0)?([79]\d{8})$/.exec(digits);
  if (et && (plus ? digits.startsWith("251") : true)) return `+251${et[1]}`;

  if (plus && !digits.startsWith("251") && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}

export function formatPhone(e164: string): string {
  const m = /^\+251(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
