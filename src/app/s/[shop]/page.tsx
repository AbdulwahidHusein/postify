import Link from "next/link";
import { Phone, Send } from "lucide-react";
import { getStorefront } from "@/server/page";
import { normalizeSettings } from "@/server/domain/shops";
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

  const showAbout = s.theme.sections.includes("about") && Boolean(shop.description);
  const showContact =
    s.theme.sections.includes("contact") &&
    Boolean(s.contact.phone || chan?.username || s.contact.telegramUsername || s.contact.address);

  return (
    <div className="space-y-8">
      <ViewBeacon shop={shop.handle} type="shop_viewed" />
      {s.theme.sections.includes("hero") && !filtered ? (
        <section className="relative overflow-hidden rounded-2xl" style={{ background: s.theme.accent }}>
          {s.theme.bannerKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={publicUrl(s.theme.bannerKey)} alt="" className="aspect-[8/3] w-full object-cover" />
          ) : (
            <div className="px-6 py-10 text-white sm:px-10 sm:py-14">
              <h1 className="text-2xl font-semibold sm:text-3xl">{shop.name}</h1>
              {s.theme.tagline ? <p className="mt-2 max-w-xl text-white/85">{s.theme.tagline}</p> : null}
            </div>
          )}
        </section>
      ) : null}

      <form action={base || "/"} className="flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t(locale, "shop.search")} className="input" />
      </form>

      {cats.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <Link href={base || "/"} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${!sp.category ? "border-transparent bg-[var(--shop-accent)] text-white" : "border-line"}`}>{t(locale, "shop.all")}</Link>
          {cats.map((c) => (
            <Link key={c.name} href={`${base}/?category=${encodeURIComponent(c.name)}`} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${sp.category === c.name ? "border-transparent bg-[var(--shop-accent)] text-white" : "border-line"}`}>
              {c.name.split(" > ").at(-1)}
            </Link>
          ))}
        </div>
      ) : null}

      {featured?.items.length && !filtered ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{featuredTitle}</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {featured.items.map((p) => <ProductCard key={p.id} p={p} base={base} locale={locale} />)}
          </div>
        </section>
      ) : null}

      {s.theme.sections.includes("grid") || filtered ? (
        <section>
          {page.items.length ? (
            <ProductGrid shop={shop.handle} base={base} locale={locale} initial={page.items} cursor={page.nextCursor} query={{ q: sp.q, category: sp.category }} />
          ) : (
            <p className="py-16 text-center text-mist">{filtered ? t(locale, "shop.noResults") : t(locale, "shop.empty")}</p>
          )}
        </section>
      ) : null}

      {!filtered && (showAbout || showContact) ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {showAbout ? (
            <div className="card p-5">
              <h2 className="font-semibold">{t(locale, "shop.about")}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{shop.description}</p>
            </div>
          ) : null}
          {showContact ? (
            <div className="card space-y-2 p-5 text-sm">
              <h2 className="font-semibold">{t(locale, "shop.contact")}</h2>
              {s.contact.phone ? <a href={`tel:${s.contact.phone}`} className="flex items-center gap-2 text-signal"><Phone size={15} /> {s.contact.phone}</a> : null}
              {chan?.username ? <a href={`https://t.me/${chan.username}`} className="flex items-center gap-2 text-signal"><Send size={15} /> {t(locale, "shop.telegram")}</a> : null}
              {s.contact.telegramUsername ? <a href={`https://t.me/${s.contact.telegramUsername}`} className="flex items-center gap-2 text-signal"><Send size={15} /> @{s.contact.telegramUsername}</a> : null}
              {s.contact.address ? <p className="text-mist">{s.contact.address}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
