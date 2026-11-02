import type { CSSProperties } from "react";
import { getStorefront } from "@/server/page";
import { normalizeSettings, shopLogoUrl } from "@/server/domain/shops";
import { StoreHeader } from "@/components/store/header";
import { GoodsMark } from "@/components/brand";
import { t } from "@/i18n";
import { appUrl } from "@/server/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ shop: string }> }) {
  const { shop } = await getStorefront((await params).shop);
  const logo = shopLogoUrl(shop);
  return {
    title: { default: shop.name, template: `%s · ${shop.name}` },
    description: shop.description ?? normalizeSettings(shop.settings).theme.tagline ?? undefined,
    openGraph: logo ? { images: [{ url: logo }] } : undefined,
  };
}

/** Pick white or ink text for a button filled with the shop's accent. */
function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#16201b" : "#ffffff";
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const s = normalizeSettings(shop.settings);
  const accent = /^#[0-9a-f]{6}$/i.test(s.theme.accent) ? s.theme.accent : "#0e6b4e";
  const vars = {
    "--shop-accent": accent,
    "--accent": accent,
    "--accent-hover": `color-mix(in oklab, ${accent} 86%, black)`,
    "--accent-soft": `color-mix(in oklab, ${accent} 10%, white)`,
    "--accent-fg": readableOn(accent),
  } as CSSProperties;
  return (
    <div lang={locale} style={vars} className={s.theme.font === "serif" ? "[&_h1]:font-serif [&_h2]:font-serif" : ""}>
      <StoreHeader shop={shop} base={base} locale={locale} logoUrl={shopLogoUrl(shop)} apiShop={shop.handle} />
      <main className="mx-auto min-h-[70dvh] max-w-6xl px-4 pb-20 pt-4 sm:pt-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-mist">
          <span>{shop.name}</span>
          <a href={appUrl()} className="inline-flex items-center gap-1.5 hover:text-ink">
            <GoodsMark size={16} /> {t(locale, "footer.poweredBy")}
          </a>
        </div>
      </footer>
    </div>
  );
}
