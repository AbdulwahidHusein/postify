import Link from "next/link";
import { Banknote, MapPin, Phone, Search, Send, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStorefront } from "@/server/page";
import { normalizeSettings, shopLogoUrl } from "@/server/domain/shops";
import { listStorefrontProducts, storefrontCategories } from "@/server/domain/storefront";
import { listCollections } from "@/server/domain/collections";
import { publicUrl } from "@/server/services/storage";
import { db } from "@/server/db";
import { channels } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { t } from "@/i18n";
import { ProductCard } from "@/components/store/product-card";
import { ProductGrid } from "@/components/store/product-grid";
import { ViewBeacon } from "@/components/store/beacon";

export default async function StorefrontHome({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const sp = await searchParams;
  const s = normalizeSettings(shop.settings);
  const [page, cats, cols, chan] = await Promise.all([
    listStorefrontProducts(shop.id, { q: sp.q, category: sp.category }),
    storefrontCategories(shop.id),
    listCollections(shop.id),
    db.query.channels.findFirst({ where: and(eq(channels.shopId, shop.id), eq(channels.status, "connected"), eq(channels.chatType, "channel")) }),
  ]);
  const featured = s.theme.featuredCollectionId && s.theme.sections.includes("featured")
    ? await listStorefrontProducts(shop.id, { collectionId: s.theme.featuredCollectionId, limit: 8 })
    : null;
  const featuredTitle = cols.find((c) => c.id === s.theme.featuredCollectionId)?.title;
  const filtered = Boolean(sp.q || sp.category);

  const taglineIsDescription = !s.theme.tagline && Boolean(shop.description && shop.description.length <= 140);
  const showAbout = s.theme.sections.includes("about") && Boolean(shop.description) && !taglineIsDescription;
  const showContact =
    s.theme.sections.includes("contact") &&
    Boolean(s.contact.phone || chan?.username || s.contact.telegramUsername || s.contact.address);

  const channelUrl = chan?.username ? `https://t.me/${chan.username}` : null;
  const logo = shopLogoUrl(shop);
  const tagline = s.theme.tagline ?? (shop.description && shop.description.length <= 140 ? shop.description : null);
  const chip = (on: boolean) =>
    cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors", on ? "bg-ink text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:ring-line-strong");

  return (
    <div className="space-y-6">
      <ViewBeacon shop={shop.handle} type="shop_viewed" />

      {s.theme.sections.includes("hero") && !filtered ? (
        <section className="overflow-hidden rounded-[20px] bg-surface ring-1 ring-line">
          <div className="relative aspect-[3/1] w-full sm:aspect-[4/1]" style={{ background: "var(--accent)" }}>
            {s.theme.bannerKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicUrl(s.theme.bannerKey)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div aria-hidden className="tibeb absolute inset-x-0 bottom-0 h-3.5" />
            )}
          </div>
          <div className="relative px-4 pb-4 sm:px-6 sm:pb-5">
            <div className="-mt-9 flex items-start justify-between gap-3 sm:-mt-11">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-[72px] w-[72px] rounded-[20px] object-cover ring-4 ring-surface sm:h-[88px] sm:w-[88px]" />
              ) : (
                <span className="grid h-[72px] w-[72px] place-items-center rounded-[20px] bg-accent font-display text-3xl font-bold text-accent-fg ring-4 ring-surface sm:h-[88px] sm:w-[88px]">
                  {shop.name.slice(0, 1)}
                </span>
              )}
              <div className="mt-12 flex gap-2 sm:mt-14">
                {channelUrl ? (
                  <a href={channelUrl} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-telegram px-3.5 text-[13px] font-semibold text-white hover:bg-telegram/90">
                    <Send size={14} /> {t(locale, "shop.telegram")}
                  </a>
                ) : null}
                {s.contact.phone ? (
                  <a href={`tel:${s.contact.phone}`} aria-label={t(locale, "shop.callUs")} className="grid h-9 w-9 place-items-center rounded-full bg-sunken text-ink hover:bg-line">
                    <Phone size={15} />
                  </a>
                ) : null}
              </div>
            </div>
            <h1 className="mt-3 font-display text-[24px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{shop.name}</h1>
            {tagline ? <p className="mt-1 max-w-2xl text-[15px] text-ink-soft">{tagline}</p> : null}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium text-mist">
              <li className="flex items-center gap-1.5"><Banknote size={15} className="text-accent-ink" /> {t(locale, "shop.payOnDelivery")}</li>
              {s.delivery.deliveryEnabled ? <li className="flex items-center gap-1.5"><Truck size={15} className="text-accent-ink" /> {s.delivery.deliveryNote ?? t(locale, "shop.delivery")}</li> : null}
              {s.delivery.pickupEnabled && s.delivery.pickupAddress ? <li className="flex items-center gap-1.5"><MapPin size={15} className="text-accent-ink" /> {s.delivery.pickupAddress}</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="sticky top-14 z-20 -mx-4 space-y-2.5 bg-canvas/95 px-4 pb-2 pt-2 backdrop-blur-md">
        <form action={base || "/"} role="search" className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          {sp.category ? <input type="hidden" name="category" value={sp.category} /> : null}
          <input name="q" defaultValue={sp.q} placeholder={t(locale, "shop.search")} aria-label={t(locale, "shop.search")} className="input h-11 rounded-full border-line bg-surface pl-10" />
        </form>
        {cats.length > 1 ? (
          <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5" aria-label="Categories">
            <Link href={base || "/"} className={chip(!sp.category)} aria-current={!sp.category ? "page" : undefined}>{t(locale, "shop.all")}</Link>
            {cats.map((c) => (
              <Link key={c.name} href={`${base}/?category=${encodeURIComponent(c.name)}`} className={chip(sp.category === c.name)} aria-current={sp.category === c.name ? "page" : undefined}>
                {c.name.split(" > ").at(-1)}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {featured?.items.length && !filtered ? (
        <section aria-labelledby="featured-title">
          <h2 id="featured-title" className="mb-3 font-display text-lg font-bold">{featuredTitle}</h2>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {featured.items.map((p) => (
              <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[220px]"><ProductCard p={p} base={base} locale={locale} /></div>
            ))}
          </div>
        </section>
      ) : null}

      {s.theme.sections.includes("grid") || filtered ? (
        <section aria-label={t(locale, "shop.all")}>
          {page.items.length ? (
            <ProductGrid shop={shop.handle} base={base} locale={locale} initial={page.items} cursor={page.nextCursor} query={{ q: sp.q, category: sp.category }} />
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink-soft"><Search size={20} /></span>
              <p className="font-display font-semibold">{filtered ? t(locale, "shop.noResults") : t(locale, "shop.empty")}</p>
              {filtered ? <Link href={base || "/"} className="mt-3 text-sm font-semibold text-accent-ink hover:underline">{t(locale, "shop.all")}</Link> : null}
            </div>
          )}
        </section>
      ) : null}

      {!filtered && (showAbout || showContact) ? (
        <section className="grid gap-3 pt-4 sm:grid-cols-2">
          {showAbout ? (
            <div className="rounded-[16px] bg-surface p-5 ring-1 ring-line">
              <h2 className="font-display font-bold">{t(locale, "shop.about")}</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-soft">{shop.description}</p>
            </div>
          ) : null}
          {showContact ? (
            <div className="space-y-2.5 rounded-[16px] bg-surface p-5 text-sm ring-1 ring-line">
              <h2 className="font-display font-bold">{t(locale, "shop.contact")}</h2>
              {s.contact.phone ? <a href={`tel:${s.contact.phone}`} className="flex items-center gap-2.5 font-medium hover:text-accent-ink"><Phone size={15} className="text-mist" /> <span className="num">{s.contact.phone}</span></a> : null}
              {chan?.username ? <a href={`https://t.me/${chan.username}`} className="flex items-center gap-2.5 font-medium hover:text-accent-ink"><Send size={15} className="text-telegram" /> {t(locale, "shop.telegram")}</a> : null}
              {s.contact.telegramUsername ? <a href={`https://t.me/${s.contact.telegramUsername}`} className="flex items-center gap-2.5 font-medium hover:text-accent-ink"><Send size={15} className="text-telegram" /> @{s.contact.telegramUsername}</a> : null}
              {s.contact.address ? <p className="flex items-center gap-2.5 text-ink-soft"><MapPin size={15} className="text-mist" /> {s.contact.address}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
