import Link from "next/link";
import { formatPrice, productImageSrc } from "@/lib/products";
import type { Product, ProductImage } from "@/db/schema";

type ProductCardProduct = Product & { images: ProductImage[] };

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProductCard({ product }: { product: ProductCardProduct }) {
  const image = product.images[0];
  const src = image ? productImageSrc(image) : null;
  const priceLabel = formatPrice(product);
  const isSold = product.status === "sold";
  const compare =
    !isSold && product.compareAtPrice != null
      ? `${product.currency} ${Number(product.compareAtPrice).toLocaleString()}`
      : null;

  return (
    <Link href={`/p/${product.slug}`} className="buy-card">
      <div className="buy-card-media">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" />
        ) : (
          <span className="buy-card-fallback">
            {initials(product.title) || "·"}
          </span>
        )}
        {isSold ? <span className="buy-card-badge">Sold</span> : null}
      </div>
      <div className="buy-card-body">
        <strong className="buy-card-title">{product.title}</strong>
        <div className="buy-card-price-row">
          <span
            className={
              isSold
                ? "buy-card-price is-sold"
                : priceLabel
                  ? "buy-card-price"
                  : "buy-card-ask"
            }
          >
            {isSold ? "Sold" : (priceLabel ?? "Ask for price")}
          </span>
          {compare && priceLabel ? (
            <span className="buy-card-compare">{compare}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
