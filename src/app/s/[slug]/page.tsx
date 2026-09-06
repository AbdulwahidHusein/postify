import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StorefrontNav } from "@/components/storefront/storefront-nav";
import { formatPrice, listPublishedProductsForShop, productImageSrc } from "@/lib/products";
import {
  getShopBySlug,
  normalizeShopSettings,
  telegramChannelUrl,
} from "@/lib/shops";

type Props = PageProps<"/s/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return { title: "Shop not found" };
  return {
    title: shop.name,
    description: shop.description ?? `${shop.name} on Postify`,
  };
}

export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  const settings = normalizeShopSettings(shop.settings);
  const sellCategories = settings.sellCategories ?? [];
  const channelUrl = telegramChannelUrl(settings.telegramChannel);
  const catalog = await listPublishedProductsForShop(shop.id);

  return (
    <div className="page-shell storefront">
      <StorefrontNav shopSlug={shop.slug} shopName={shop.name} />

      <header className="storefront-head">
        <p className="eyebrow">Shop</p>
        <h1>{shop.name}</h1>
        <p className="muted storefront-desc">
          {shop.description ||
            "Products synced from the linked Telegram channel."}
        </p>

        {(channelUrl ||
          settings.ownerUsername ||
          settings.ownerPhone ||
          sellCategories.length > 0) && (
          <div className="storefront-meta">
            {channelUrl ? (
              <a
                className="storefront-meta-link"
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {settings.telegramChannel?.startsWith("@")
                  ? settings.telegramChannel
                  : "Telegram channel"}
              </a>
            ) : null}
            {settings.ownerUsername ? (
              <span className="storefront-meta-item">
                {settings.ownerUsername}
              </span>
            ) : null}
            {settings.ownerPhone ? (
              <a
                className="storefront-meta-link"
                href={`tel:${settings.ownerPhone.replace(/\s+/g, "")}`}
              >
                {settings.ownerPhone}
              </a>
            ) : null}
            {sellCategories.length > 0 ? (
              <ul className="storefront-cats">
                {sellCategories.map((cat) => (
                  <li key={cat}>{cat}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </header>

      {catalog.length === 0 ? (
        <section className="admin-empty">
          <h2>No products yet</h2>
          <p>Check back soon — new listings appear here when published.</p>
        </section>
      ) : (
        <div className="catalog-grid">
          {catalog.map((product) => {
            const image = product.images[0];
            const priceLabel = formatPrice(product);
            const src = image ? productImageSrc(image) : null;
            return (
              <Link
                key={product.id}
                href={`/p/${product.slug}`}
                className="catalog-item"
              >
                <div className="catalog-thumb">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" />
                  ) : (
                    <span className="muted">No image</span>
                  )}
                </div>
                <div className="catalog-copy">
                  <strong>{product.title}</strong>
                  <span className="muted">
                    {priceLabel ?? "Price on request"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
