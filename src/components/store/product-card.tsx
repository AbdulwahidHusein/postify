import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { t, type Locale } from "@/i18n";

type P = {
  slug: string;
  title: string;
  status: string;
  available: boolean;
  priceMinor: string | null;
  compareAtMinor: string | null;
  currency: string;
  images: { src: string | null; thumb: string | null; color: string | null }[];
};

export function ProductCard({ p, base, locale }: { p: P; base: string; locale: Locale }) {
  const img = p.images[0];
  const soldOut = p.status === "sold" || !p.available;
  return (
    <Link href={`${base}/p/${p.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-xl" style={{ background: img?.color ?? "var(--paper-muted)" }}>
        {img?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.src}
            srcSet={img.thumb ? `${img.thumb} 320w, ${img.src} 800w` : undefined}
            sizes="(min-width: 1024px) 25vw, 50vw"
            alt={p.title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${soldOut ? "opacity-60" : ""}`}
          />
        ) : null}
        {soldOut ? (
          <span className="absolute left-2 top-2 rounded-md bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
            {p.status === "sold" ? t(locale, "product.sold") : t(locale, "product.soldOut")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{p.title}</p>
      <p className="mt-0.5 text-sm">
        {p.priceMinor ? <span className="font-semibold tabular-nums">{formatMoney(p.priceMinor, p.currency)}</span> : <span className="text-mist">{t(locale, "product.askPrice")}</span>}
        {p.compareAtMinor ? <span className="ml-1.5 text-xs text-mist line-through tabular-nums">{formatMoney(p.compareAtMinor, p.currency)}</span> : null}
      </p>
    </Link>
  );
}
