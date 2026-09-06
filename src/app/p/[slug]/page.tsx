import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductMediaGallery } from "@/components/storefront/product-media-gallery";
import { StorefrontNav } from "@/components/storefront/storefront-nav";
import {
  formatPrice,
  getProductBySlug,
  productImageSrc,
} from "@/lib/products";

type Props = PageProps<"/p/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "demo") return { title: "Demo sneakers" };
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") {
    return { title: "Product" };
  }
  return { title: product.title };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  if (slug === "demo") {
    return (
      <div className="page-shell product-layout">
        <StorefrontNav backHref="/" backLabel="Home" />
        <div className="product-media">Demo photo</div>
        <div className="panel stack">
          <p className="eyebrow">Product</p>
          <h1>Demo sneakers — mint pair</h1>
          <p className="price">ETB 4,500</p>
          <p className="muted">Placeholder demo product.</p>
        </div>
      </div>
    );
  }

  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

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

  return (
    <div className="page-shell">
      <StorefrontNav
        shopSlug={shopSlug}
        shopName={shopName}
        backHref={shopSlug ? `/s/${shopSlug}` : "/"}
        backLabel="Shop"
      />

      <div className="product-layout">
        <ProductMediaGallery title={product.title} images={gallery} />

        <div className="panel stack">
          <p className="eyebrow">{shopName ?? "Product"}</p>
          <h1>{product.title}</h1>
          <div className="preview-price-row">
            <p className="price">{priceLabel ?? "Price on request"}</p>
            {compare ? <p className="preview-compare">{compare}</p> : null}
          </div>
          {product.category || product.sku ? (
            <p className="muted" style={{ margin: 0 }}>
              {[product.category, product.sku ? `SKU ${product.sku}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {product.stockQuantity != null ? (
            <p className="muted" style={{ margin: 0 }}>
              {product.stockQuantity} in stock
            </p>
          ) : null}
          {product.description ? (
            <p className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {product.description}
            </p>
          ) : null}
          {product.tags ? (
            <div className="preview-tags">
              {product.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag} className="admin-chip">
                    {tag}
                  </span>
                ))}
            </div>
          ) : null}
          {shopSlug ? (
            <div
              className="hero-actions"
              style={{ justifyContent: "flex-start" }}
            >
              <Link href={`/s/${shopSlug}`} className="btn btn-primary">
                View shop
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
