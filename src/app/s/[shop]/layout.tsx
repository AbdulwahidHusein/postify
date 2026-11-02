import { getStorefront } from "@/server/page";
import { normalizeSettings, shopLogoUrl } from "@/server/domain/shops";
import { StoreHeader } from "@/components/store/header";
import { t } from "@/i18n";

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

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const s = normalizeSettings(shop.settings);
  return (
    <div lang={locale} style={{ ["--shop-accent" as string]: s.theme.accent }} className={s.theme.font === "serif" ? "[&_h1]:font-serif [&_h2]:font-serif" : ""}>
      <StoreHeader shop={shop} base={base} locale={locale} logoUrl={shopLogoUrl(shop)} apiShop={shop.handle} />
      <main className="mx-auto min-h-[70dvh] max-w-6xl px-4 pb-16 pt-5">{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-mist">
        {shop.name} · {t(locale, "shop.all")} · Powered by Goods
      </footer>
    </div>
  );
}
