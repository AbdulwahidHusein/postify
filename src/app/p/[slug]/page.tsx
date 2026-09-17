import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import { ProductMediaGallery } from "@/components/storefront/product-media-gallery";
import { ProductSpecs } from "@/components/storefront/product-specs";
import { StorefrontNav } from "@/components/storefront/storefront-nav";
import { MessageSellerButton } from "@/components/chat/message-seller-button";
import { RequestOrderButton } from "@/components/storefront/request-order-button";
import {
  formatPrice,
  getProductBySlug,
  listMoreFromShop,
  productImageSrc,
} from "@/lib/products";
import { normalizeShopSettings, telegramChannelUrl } from "@/lib/shops";
import { telegramMessageUrl } from "@/lib/telegram-links";
import type { ShopViewer } from "@/lib/viewer";
import { resolveShopViewer } from "@/lib/viewer";

type Props = PageProps<"/p/[slug]">;

/** Skip captions that only restate the price. */
function usefulDescription(
  description: string | null | undefined,
  priceLabel: string | null,
) {
  const raw = description?.trim();
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/[\s,]+/g, "");
  if (/^(price)?\d+(\.\d+)?(etb|usd|eur|birr|br)?\.?$/.test(compact)) {
    return null;
  }
  if (priceLabel) {
    const priceCompact = priceLabel.toLowerCase().replace(/[\s,]+/g, "");
    if (compact === priceCompact || compact === `price${priceCompact}`) {
      return null;
    }
  }
  return raw;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "demo") return { title: "Demo sneakers" };
  const product = await getProductBySlug(slug);
  if (!product || (product.status !== "published" && product.status !== "sold")) {
    return { title: "Product" };
  }
  const cover = product.images[0] ? productImageSrc(product.images[0]) : null;
  return {
    title: product.title,
    description:
      product.description?.slice(0, 160) ||
      `${product.title} from ${product.shop?.name ?? "Goods"}`,
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

function BuyerActions({
  productId,
  phone,
  telegramUrl,
}: {
  productId: string;
  phone: string | null;
  telegramUrl: string | null;
}) {
  return (
    <div className="buy-cta">
      <RequestOrderButton productId={productId} />
      <MessageSellerButton productId={productId} />
      {phone || telegramUrl ? (
        <div className="buy-cta-links">
          {phone ? (
            <a href={`tel:${phone.replace(/\s+/g, "")}`}>Call</a>
          ) : null}
          {phone && telegramUrl ? <span aria-hidden>·</span> : null}
          {telegramUrl ? (
            <a href={telegramUrl} target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const guestViewer: ShopViewer = { kind: "guest" };

  if (slug === "demo") {
    return (
      <div className="buy-page">
        <div className="page-shell buy-shell">
          <StorefrontNav
            backHref="/"
            backLabel="Home"
            viewer={guestViewer}
          />
          <div className="buy-layout">
            <div className="buy-gallery">
              <div className="buy-gallery-stage buy-gallery-empty">
                Demo photo
              </div>
            </div>
            <div className="buy-info">
              <h1 className="buy-title">Demo sneakers — mint pair</h1>
              <p className="buy-price">ETB 4,500</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const product = await getProductBySlug(slug);
  if (
    !product ||
    (product.status !== "published" && product.status !== "sold")
  ) {
    notFound();
  }

  const isSold = product.status === "sold";
  const priceLabel = formatPrice(product);
  const compare =
    product.compareAtPrice != null
      ? `${product.currency} ${Number(product.compareAtPrice).toLocaleString()}`
      : null;
  const gallery = product.images.map((img) => ({
    id: img.id,
    src: productImageSrc(img),
    alt: img.alt,
  }));
  const shopSlug = product.shop?.slug;
  const shopName = product.shop?.name;
  const shopSettings = product.shop
    ? normalizeShopSettings(product.shop.settings)
    : null;
  const channelUrl = telegramChannelUrl(shopSettings?.telegramChannel);
  const telegramPostUrl = telegramMessageUrl({
    username: product.channel?.username,
    chatId: product.sourceChatId,
    messageId: product.sourceMessageId,
  });
  const telegramUrl = telegramPostUrl ?? channelUrl;
  const phone = shopSettings?.ownerPhone?.trim() || null;
  const description = usefulDescription(product.description, priceLabel);

  const tags = (product.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const [more, viewer] = await Promise.all([
    listMoreFromShop(product.shopId, product.id, 8),
    shopSlug && shopName
      ? resolveShopViewer({
          shopId: product.shopId,
          shopSlug,
          shopName,
        })
      : Promise.resolve(guestViewer),
  ]);

  const isOwner = viewer.kind === "owner";

  return (
    <div className="buy-page">
      <div className="page-shell buy-shell">
        <StorefrontNav
          shopSlug={shopSlug}
          shopName={shopName}
          backHref={shopSlug ? `/s/${shopSlug}` : "/"}
          backLabel="Shop"
          viewer={viewer}
          ownerPrimaryHref={
            shopSlug
              ? `/dashboard/s/${shopSlug}/products/${product.id}`
              : undefined
          }
          ownerPrimaryLabel="Edit listing"
        />

        <article className="buy-layout">
          <ProductMediaGallery title={product.title} images={gallery} />

          <div className="buy-info">
            {isSold ? <p className="buy-sold-badge">Sold</p> : null}

            <h1 className="buy-title">{product.title}</h1>

            <div className="buy-price-block">
              <p className={isSold ? "buy-price is-sold" : "buy-price"}>
                {priceLabel ?? "Ask for price"}
              </p>
              {compare && !isSold ? (
                <p className="buy-compare">{compare}</p>
              ) : null}
            </div>

            {product.category ? (
              <p className="buy-category">{product.category}</p>
            ) : null}

            {(product.condition || product.isNegotiable) && !isSold ? (
              <div className="buy-badges">
                {product.condition ? (
                  <span className="buy-badge buy-badge-condition">
                    {product.condition}
                  </span>
                ) : null}
                {product.isNegotiable ? (
                  <span className="buy-badge buy-badge-negotiable">
                    Negotiable
                  </span>
                ) : null}
              </div>
            ) : null}

            <ProductSpecs product={product} />

            {description ? <p className="buy-desc">{description}</p> : null}

            {tags.length > 0 ? (
              <ul className="buy-tags">
                {tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            ) : null}

            {product.shippingInfo || product.returnPolicy ? (
              <div className="buy-policy">
                {product.shippingInfo ? (
                  <p className="buy-policy-item">
                    <strong>Shipping:</strong> {product.shippingInfo}
                  </p>
                ) : null}
                {product.returnPolicy ? (
                  <p className="buy-policy-item">
                    <strong>Returns:</strong> {product.returnPolicy}
                  </p>
                ) : null}
              </div>
            ) : null}

            {isSold ? (
              <div className="buy-cta">
                <MessageSellerButton productId={product.id} />
                {shopSlug ? (
                  <Link href={`/s/${shopSlug}`} className="btn btn-ghost">
                    Browse shop
                  </Link>
                ) : null}
              </div>
            ) : !isOwner ? (
              <BuyerActions
                productId={product.id}
                phone={phone}
                telegramUrl={telegramUrl}
              />
            ) : null}
          </div>
        </article>

        {more.length > 0 && shopSlug ? (
          <section className="buy-more" aria-labelledby="more-heading">
            <div className="buy-more-head">
              <h2 id="more-heading" className="buy-more-title">
                More from {shopName ?? "this shop"}
              </h2>
              <Link href={`/s/${shopSlug}`} className="buy-more-all">
                See all
              </Link>
            </div>
            <div className="buy-more-grid">
              {more.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
