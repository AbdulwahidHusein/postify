"use client";

import { useRouter } from "next/navigation";
import { t, type Locale } from "@/i18n";

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  return (
    <button
      className="rounded-lg px-2 py-1.5 text-sm text-mist hover:bg-paper-muted"
      onClick={() => {
        document.cookie = `goods_lang=${locale === "am" ? "en" : "am"}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {t(locale, "nav.language")}
    </button>
  );
}
