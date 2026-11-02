import type { CSSProperties } from "react";
import { and, eq } from "drizzle-orm";
import { getStorefront, storeDesign } from "@/server/page";
import { normalizeSettings, shopLogoUrl } from "@/server/domain/shops";
import { db } from "@/server/db";
import { channels } from "@/server/db/schema";
import { FONT_CLASS, storeHref, themeVars } from "@/lib/store-design";
import { cn } from "@/lib/utils";
import { StoreHeader } from "@/components/store/header";
import { PreviewBridge } from "@/components/store/preview-bridge";
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

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const { design, preview } = await storeDesign(shop);
  const chan = await db.query.channels.findFirst({
    where: and(eq(channels.shopId, shop.id), eq(channels.status, "connected"), eq(channels.chatType, "channel")),
    columns: { username: true },
  });
  const ctx = { base, channelUrl: chan?.username ? `https://t.me/${chan.username}` : null };
  const menu = design.menu.map((m) => ({ label: m.label, href: storeHref(m.link, ctx) })).filter((m): m is { label: string; href: string } => Boolean(m.href));
  const ann = design.announcement;
  const annHref = ann.enabled ? storeHref(ann.link, ctx) : null;

  return (
    <div lang={locale} style={themeVars(design.theme) as CSSProperties} className={cn("min-h-dvh bg-canvas text-ink", FONT_CLASS[design.theme.font], design.theme.background === "dark" && "[color-scheme:dark]")}>
      {ann.enabled && ann.text ? (
        <div className="bg-ink px-4 py-2 text-center font-display text-[13px] font-semibold text-canvas">
          {annHref ? <a href={annHref} className="underline-offset-4 hover:underline">{ann.text}</a> : ann.text}
        </div>
      ) : null}
      <StoreHeader shop={shop} base={base} locale={locale} logoUrl={shopLogoUrl(shop)} apiShop={shop.handle} menu={menu} />
      <main className="mx-auto min-h-[70dvh] max-w-6xl px-4 pb-20 pt-4 sm:pt-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-mist">
          <span className="font-display font-semibold">{shop.name}</span>
          {menu.length ? (
            <nav aria-label={shop.name} className="flex flex-wrap gap-x-4 gap-y-1">
              {menu.map((m) => <a key={m.label + m.href} href={m.href} className="font-semibold hover:text-ink">{m.label}</a>)}
            </nav>
          ) : null}
          <a href={appUrl()} className="inline-flex items-center gap-1.5 hover:text-ink">
            <GoodsMark size={16} /> {t(locale, "footer.poweredBy")}
          </a>
        </div>
      </footer>
      {preview ? <PreviewBridge /> : null}
    </div>
  );
}
