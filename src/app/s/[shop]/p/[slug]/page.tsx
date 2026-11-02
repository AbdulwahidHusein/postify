import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, MapPin, Send, Truck } from "lucide-react";
import { normalizeSettings } from "@/server/domain/shops";
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

  const settings = normalizeSettings(shop.settings);
  const fee = BigInt(settings.delivery.deliveryFeeMinor || "0");
  const off = p.priceMinor && p.compareAtMinor && BigInt(p.compareAtMinor) > BigInt(p.priceMinor) ? Math.round((1 - Number(p.priceMinor) / Number(p.compareAtMinor)) * 100) : 0;

  return (
    <article className="pb-24 md:pb-0">
      <ViewBeacon shop={shop.handle} type="product_viewed" productId={p.id} sourceCode={sourceCode} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="-mt-4 grid gap-5 sm:mt-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
        <Gallery images={p.images} title={p.title} />
        <div className="min-w-0">
          {p.category ? (
            <Link href={`${base}/?category=${encodeURIComponent(p.category)}`} className="text-[13px] font-semibold text-accent hover:underline">{p.category.split(" > ").at(-1)}</Link>
          ) : null}
          <h1 className="mt-1 font-display text-[22px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{p.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {p.priceMinor ? (
              <span className="num font-display text-[28px] font-bold leading-none tracking-[-0.01em]">{formatMoney(BigInt(p.priceMinor), p.currency)}</span>
            ) : (
              <span className="font-display text-xl font-bold text-accent">{t(locale, "product.askPrice")}</span>
            )}
            {off ? (
              <>
                <span className="num text-base text-faint line-through">{formatMoney(BigInt(p.compareAtMinor!), p.currency)}</span>
                <span className="num rounded-full bg-adey px-2 py-0.5 text-xs font-bold text-ink">−{off}%</span>
              </>
            ) : null}
            {p.isNegotiable ? <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft">{t(locale, "product.negotiable")}</span> : null}
          </div>

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

          <ul className="mt-5 divide-y divide-line rounded-[16px] bg-surface text-sm ring-1 ring-line">
            <li className="flex items-center gap-3 px-4 py-3"><Banknote size={18} className="shrink-0 text-accent" /> <span className="text-ink-soft">{t(locale, "product.payOnDelivery")}</span></li>
            {settings.delivery.deliveryEnabled ? (
              <li className="flex items-center gap-3 px-4 py-3">
                <Truck size={18} className="shrink-0 text-accent" />
                <span className="text-ink-soft">
                  <b className="font-semibold text-ink">{fee > 0n ? t(locale, "product.deliveryFee", { fee: formatMoney(fee, p.currency) ?? "" }) : t(locale, "product.freeDelivery")}</b>
                  {settings.delivery.deliveryNote ? `, ${settings.delivery.deliveryNote}` : ""}
                </span>
              </li>
            ) : null}
            {settings.delivery.pickupEnabled ? (
              <li className="flex items-center gap-3 px-4 py-3"><MapPin size={18} className="shrink-0 text-accent" /> <span className="text-ink-soft">{t(locale, "product.pickup")}{settings.delivery.pickupAddress ? `: ${settings.delivery.pickupAddress}` : ""}</span></li>
            ) : null}
          </ul>

          {specs.length ? (
            <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-4 py-2.5"><dt className="text-mist">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          ) : null}
          {p.description ? (
            <div className="mt-6">
              <h2 className="font-display text-base font-bold">{t(locale, "product.details")}</h2>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{p.description}</p>
            </div>
          ) : null}
          {tgLink ? (
            <a href={tgLink} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-telegram-soft px-3.5 py-2 text-[13px] font-semibold text-[#106a96] hover:bg-telegram/15">
              <Send size={14} /> {t(locale, "product.viewOnTelegram")}
            </a>
          ) : null}
        </div>
      </div>
      {related.length ? (
        <section className="mt-12 border-t border-line pt-8" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-4 font-display text-lg font-bold">{t(locale, "product.related")}</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4">
            {related.slice(0, 8).map((r) => <ProductCard key={r.id} p={r} base={base} locale={locale} />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
