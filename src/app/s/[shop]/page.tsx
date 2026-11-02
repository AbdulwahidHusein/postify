import Link from "next/link";
import { Search } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { cn } from "@/lib/utils";
import { getStorefront, storeDesign } from "@/server/page";
import { normalizeSettings } from "@/server/domain/shops";
import { listStorefrontProducts, storefrontCategories } from "@/server/domain/storefront";
import { listCollections } from "@/server/domain/collections";
import { publicUrl } from "@/server/services/storage";
import { db } from "@/server/db";
import { channels } from "@/server/db/schema";
import { t } from "@/i18n";
import { ProductGrid } from "@/components/store/product-grid";
import { ViewBeacon } from "@/components/store/beacon";
import { StoreSectionView, type SectionData } from "@/components/store/sections";

export default async function StorefrontHome({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const sp = await searchParams;
  const s = normalizeSettings(shop.settings);
  const { design } = await storeDesign(shop);
  const filtered = Boolean(sp.q || sp.category);
  const visible = filtered ? design.sections.filter((x) => x.type === "grid") : design.sections.filter((x) => !x.hidden);
  const needs = new Set(visible.map((x) => x.type));

  const [page, cats, cols, chan] = await Promise.all([
    listStorefrontProducts(shop.id, { q: sp.q, category: sp.category }),
    storefrontCategories(shop.id),
    needs.has("featured") ? listCollections(shop.id) : Promise.resolve([]),
    db.query.channels.findFirst({ where: and(eq(channels.shopId, shop.id), eq(channels.status, "connected"), eq(channels.chatType, "channel")) }),
  ]);

  // Category tiles show the newest photo in each category.
  const categories = needs.has("categories")
    ? await Promise.all(
        cats.slice(0, 8).map(async (c) => {
          const first = await listStorefrontProducts(shop.id, { category: c.name, limit: 1 });
          const img = first.items[0]?.images[0];
          return { ...c, image: img?.thumb ?? img?.src ?? null };
        }),
      )
    : [];

  const featured: SectionData["featured"] = {};
  await Promise.all(
    visible.map(async (x) => {
      if (x.type !== "featured") return;
      const col = x.collectionId ? cols.find((c) => c.id === x.collectionId) : null;
      const list = await listStorefrontProducts(shop.id, { collectionId: col?.id, limit: x.limit });
      featured[x.id] = { title: col?.title ?? null, items: list.items, href: col ? `${base}/c/${col.handle}` : null };
    }),
  );

  const chip = (on: boolean) =>
    cn("shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-display text-[13px] font-semibold transition-colors", on ? "bg-ink text-canvas" : "bg-surface text-ink-soft ring-1 ring-line hover:ring-line-strong");

  const grid = (
    <>
      <div className="sticky top-16 z-20 -mx-4 space-y-2.5 bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur-md">
        <form action={base || "/"} role="search" className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
          {sp.category ? <input type="hidden" name="category" value={sp.category} /> : null}
          <input name="q" defaultValue={sp.q} placeholder={t(locale, "shop.search")} aria-label={t(locale, "shop.search")} className="input rounded-full bg-surface pl-11" />
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
      {page.items.length ? (
        <ProductGrid shop={shop.handle} base={base} locale={locale} initial={page.items} cursor={page.nextCursor} query={{ q: sp.q, category: sp.category }} />
      ) : (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-surface text-ink-soft"><Search size={22} /></span>
          <p className="font-display text-lg font-bold">{filtered ? t(locale, "shop.noResults") : t(locale, "shop.empty")}</p>
          {filtered ? <Link href={base || "/"} className="mt-3 font-display text-sm font-bold text-accent-ink hover:underline">{t(locale, "shop.all")}</Link> : null}
        </div>
      )}
    </>
  );

  const data: SectionData = {
    base,
    locale,
    shopName: shop.name,
    channelUrl: chan?.username ? `https://t.me/${chan.username}` : null,
    channelTitle: chan?.title ?? null,
    imageUrl: publicUrl,
    categories,
    featured,
    contact: s.contact,
    delivery: s.delivery,
    description: shop.description,
    grid,
  };

  return (
    <div className="space-y-8 sm:space-y-12">
      <ViewBeacon shop={shop.handle} type="shop_viewed" />
      {visible.map((x) => (
        <div key={x.id} data-section-id={x.id} className="scroll-mt-24 empty:hidden">
          <StoreSectionView s={x} d={data} />
        </div>
      ))}
      {!visible.some((x) => x.type === "grid") && filtered ? grid : null}
    </div>
  );
}
