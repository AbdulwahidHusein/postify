import { notFound } from "next/navigation";
import { getStorefront } from "@/server/page";
import { relatedProducts } from "@/server/domain/storefront";
import { getStorefrontProduct, serializeProduct } from "@/server/domain/products";
import { postLink } from "@/server/services/telegram";
import { formatMoney } from "@/lib/money";
import { t } from "@/i18n";
import { ProductCard } from "@/components/store/product-card";
import { Gallery } from "@/components/store/gallery";
import { BuyBox } from "@/components/store/buy-box";
import { ViewBeacon } from "@/components/store/beacon";

type Props = { params: Promise<{ shop: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { shop: sp, slug } = await params;
  const { shop } = await getStorefront(sp);
  const p = await getStorefrontProduct(shop.id, slug);
  if (!p) return {};
  const s = serializeProduct(p);
  return {
    title: s.title,
    description: s.description?.slice(0, 160) ?? undefined,
    openGraph: s.images[0]?.large ? { images: [{ url: s.images[0].large }] } : undefined,
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { shop: shopParam, slug } = await params;
  const sp = await searchParams;
  const { shop, base, locale } = await getStorefront(shopParam);
  const raw = await getStorefrontProduct(shop.id, slug);
  if (!raw) notFound();
  const p = serializeProduct(raw);
  const related = await relatedProducts(shop.id, p.id, p.category);
  const source = raw.sources?.find((s) => s.buttonStatus !== "deleted");
  const tgLink = source ? postLink({ username: source.channel?.username, chatId: source.chatId, messageId: source.messageId }) : null;
  const specs = [
    ["Brand", p.brand], ["Model", p.model], ["Condition", p.condition], ["Location", p.location],
    ...Object.entries(p.attributes ?? {}),
  ].filter(([, v]) => v) as [string, string][];
  const sourceCode = sp.src && /^[A-Za-z0-9]{4,16}$/.test(sp.src) ? sp.src : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description ?? undefined,
    image: p.images.map((i) => i.large).filter(Boolean),
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    offers: p.priceMinor
      ? { "@type": "Offer", priceCurrency: p.currency, price: (Number(p.priceMinor) / 100).toFixed(2), availability: p.available ? "https://schema.org/InStock" : "https://schema.org/SoldOut" }
      : undefined,
  };

  return (
    <article>
      <ViewBeacon shop={shop.handle} type="product_viewed" productId={p.id} sourceCode={sourceCode} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <Gallery images={p.images} title={p.title} />
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{p.title}</h1>
          <p className="mt-2 flex flex-wrap items-baseline gap-2">
            {p.priceMinor ? <span className="text-2xl font-semibold tabular-nums">{formatMoney(p.priceMinor, p.currency)}</span> : <span className="text-lg text-mist">{t(locale, "product.askPrice")}</span>}
            {p.compareAtMinor ? <span className="text-mist line-through tabular-nums">{formatMoney(p.compareAtMinor, p.currency)}</span> : null}
            {p.isNegotiable ? <span className="rounded bg-paper-muted px-2 py-0.5 text-xs">{t(locale, "product.negotiable")}</span> : null}
          </p>
          <BuyBox
            shop={shop.handle}
            base={base}
            locale={locale}
            productId={p.id}
            variantId={p.variants[0]?.id ?? null}
            hasPrice={Boolean(p.priceMinor)}
            available={p.available}
            sold={p.status === "sold"}
            stock={p.trackInventory ? p.inventoryQty : null}
            sourceCode={sourceCode}
            autoOrder={sp.order === "1"}
          />
          {specs.length ? (
            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-mist">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          ) : null}
          {p.description ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold">{t(locale, "product.details")}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{p.description}</p>
            </div>
          ) : null}
          {tgLink ? <a href={tgLink} target="_blank" className="mt-6 inline-block text-sm text-signal">{t(locale, "product.viewOnTelegram")} ↗</a> : null}
        </div>
      </div>
      {related.length ? (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold">{t(locale, "product.related")}</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4">
            {related.slice(0, 8).map((r) => <ProductCard key={r.id} p={r} base={base} locale={locale} />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
