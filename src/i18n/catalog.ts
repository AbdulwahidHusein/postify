/**
 * Expert EN/AM catalog (`i18n/goods-strings.json`). Every user-facing string
 * in the product lives here; runtime helpers read Amharic from the filled
 * `am` fields.
 */
import catalog from "../../i18n/goods-strings.json";

export type Locale = "en" | "am";

type StringEntry = {
  en: string;
  am?: string;
  am_draft?: string;
  context?: string;
  limit?: string;
};

type Section = {
  id: string;
  strings?: Record<string, StringEntry>;
};

const entries: Record<string, { en: string; am: string }> = (() => {
  const out: Record<string, { en: string; am: string }> = {};
  const sections = (catalog as unknown as { sections: Section[] }).sections;
  for (const section of sections) {
    for (const [key, val] of Object.entries(section.strings ?? {})) {
      if (!val?.en) continue;
      const am = (val.am ?? "").trim() || (val.am_draft ?? "").trim() || val.en;
      out[key] = { en: val.en, am };
    }
  }
  return out;
})();

export type CatalogKey = string;

export function hasCatalogKey(key: string): boolean {
  return key in entries;
}

/** Translate a catalog key. Falls back to English, then the key itself. */
export function tc(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = entries[key];
  let s = entry ? (locale === "am" ? entry.am : entry.en) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function catalogEn(key: string): string {
  return entries[key]?.en ?? key;
}

/** Prefer Amharic when Telegram reports `am` / `am-ET`. */
export function localeFromTelegram(
  languageCode: string | null | undefined,
): Locale {
  const code = (languageCode ?? "").toLowerCase();
  return code === "am" || code.startsWith("am-") ? "am" : "en";
}

export function asLocale(v: string | null | undefined): Locale {
  return v === "am" ? "am" : "en";
}
