"use client";

import { useRouter } from "next/navigation";
import { t, type Locale } from "@/i18n";

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  return (
    <button
      className="h-9 rounded-full border border-line px-3 text-[13px] font-semibold text-ink-soft hover:bg-sunken"
      lang={locale === "am" ? "en" : "am"}
      onClick={() => {
        document.cookie = `goods_lang=${locale === "am" ? "en" : "am"}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {t(locale, "nav.language")}
    </button>
  );
}
