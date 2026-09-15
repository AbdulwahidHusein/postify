import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import {
  ShopCatalogToolbar,
  shopCatalogHref,
  type ShopSort,
} from "@/components/storefront/shop-catalog-toolbar";
import { StorefrontNav } from "@/components/storefront/storefront-nav";
import { PaginationBar } from "@/components/pagination-bar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  getPublishedPriceBoundsForShop,
  listPublishedCategoriesForShop,
  listPublishedProductsForShop,
} from "@/lib/products";
import {
  getShopBySlug,
  normalizeShopSettings,
  telegramChannelUrl,
} from "@/lib/shops";
import { resolveShopViewer } from "@/lib/viewer";

type Props = PageProps<"/s/[slug]">;

function shopInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function paramString(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

function parseSort(value: string): ShopSort {
  if (value === "price_asc" || value === "price_desc") return value;
  return "newest";
}

function parsePrice(value: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return { title: "Shop not found" };
  const settings = normalizeShopSettings(shop.settings);
  return {
    title: shop.name,
    description: shop.description ?? `${shop.name} on Goods`,
    openGraph: settings.logoUrl
      ? { images: [{ url: settings.logoUrl }] }
      : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  const q = paramString(query.q);
  const category = paramString(query.category);
  const sort = parseSort(paramString(query.sort));
  const minPriceRaw = paramString(query.minPrice);
  const maxPriceRaw = paramString(query.maxPrice);
  const minPrice = parsePrice(minPriceRaw);
  const maxPrice = parsePrice(maxPriceRaw);
  const pageRaw = paramString(query.page) || "1";
  const page = Number.parseInt(pageRaw, 10);
  const filtered = Boolean(
    q ||
      category ||
      sort !== "newest" ||
      minPrice != null ||
      maxPrice != null,
  );

  const settings = normalizeShopSettings(shop.settings);
  const viewer = await resolveShopViewer({
    shopId: shop.id,
    shopSlug: shop.slug,
    shopName: shop.name,
  });
  const isOwner = viewer.kind === "owner";

  // Hidden shop: only the owner can see it (while setting up).
  if (!settings.shopVisible && !isOwner) {
    notFound();
  }

  const publicChannel = telegramChannelUrl(settings.telegramChannel);
  const sellCategories = settings.sellCategories ?? [];
  const currency = settings.defaultCurrency || "ETB";

  const [catalogPage, productCategories, priceBounds] =
    await Promise.all([
      listPublishedProductsForShop(shop.id, {
        page: Number.isFinite(page) ? page : 1,
        pageSize: DEFAULT_PAGE_SIZE,
        q: q || undefined,
        category: category || undefined,
        sort,
        minPrice,
        maxPrice,
      }),
      listPublishedCategoriesForShop(shop.id),
      getPublishedPriceBoundsForShop(shop.id),
    ]);

  const { products: catalog, pagination } = catalogPage;
  const logoUrl = settings.logoUrl;
  const initials = shopInitials(shop.name);
  const description = shop.description?.trim() || null;

  const chipSet = new Map<string, string>();
  for (const cat of [...productCategories, ...sellCategories]) {
    const key = cat.toLowerCase();
    if (!chipSet.has(key)) chipSet.set(key, cat);
  }
  const filterCategories = [...chipSet.values()];

  const hrefForPage = (p: number) =>
    shopCatalogHref(shop.slug, {
      q,
      category,
      sort,
      minPrice: minPriceRaw,
      maxPrice: maxPriceRaw,
      page: p,
    });

  return (
    <div className="buy-page shop-page">
      <div className="page-shell buy-shell shop-shell">
        <StorefrontNav
          shopSlug={shop.slug}
          shopName={shop.name}
          backHref="/"
          backLabel="Home"
          viewer={viewer}
        />

        <header className="shop-hero">
          <div className="shop-hero-brand">
            <div className="shop-top-logo" aria-hidden>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" />
              ) : (
                <span>{initials || "?"}</span>
              )}
            </div>
            <div className="shop-top-copy">
              <h1 className="shop-top-title">{shop.name}</h1>
              {description ? (
                <p className="shop-top-desc">{description}</p>
              ) : null}
              {!isOwner && (publicChannel || settings.ownerPhone) ? (
                <p className="shop-hero-meta">
                  {publicChannel ? (
                    <a
                      className="shop-hero-link"
                      href={publicChannel}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Telegram
                    </a>
                  ) : null}
                  {publicChannel && settings.ownerPhone ? (
                    <span aria-hidden> · </span>
                  ) : null}
                  {settings.ownerPhone ? (
                    <a
                      className="shop-hero-link"
                      href={`tel:${settings.ownerPhone.replace(/\s+/g, "")}`}
                    >
                      Call
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="shop-catalog" aria-label="Products">
          <ShopCatalogToolbar
            shopSlug={shop.slug}
            q={q}
            category={category}
            sort={sort}
            minPrice={minPriceRaw}
            maxPrice={maxPriceRaw}
            categories={filterCategories}
            resultCount={pagination.total}
            filtered={filtered}
            priceBounds={priceBounds}
            currency={currency}
          />

          {catalog.length === 0 ? (
            <div className="shop-empty">
              <h2>{filtered ? "No matches" : "No products yet"}</h2>
              <p>
                {filtered
                  ? "Try a different search or clear filters."
                  : isOwner
                    ? "Add a product or post one in your connected Telegram channel."
                    : "Nothing listed yet."}
              </p>
              {filtered ? (
                <a href={`/s/${shop.slug}`} className="btn btn-ghost btn-sm">
                  Clear filters
                </a>
              ) : null}
            </div>
          ) : (
            <>
              <div className="shop-grid">
                {catalog.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <PaginationBar meta={pagination} hrefForPage={hrefForPage} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
