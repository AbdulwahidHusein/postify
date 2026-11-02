import Link from "next/link";
import { ImageIcon } from "lucide-react";
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
  isNegotiable?: boolean;
  images: { src: string | null; thumb: string | null; color: string | null }[];
};

export function ProductCard({ p, base, locale, priority }: { p: P; base: string; locale: Locale; priority?: boolean }) {
  const img = p.images[0];
  const soldOut = p.status === "sold" || !p.available;
  const off =
    p.priceMinor && p.compareAtMinor && BigInt(p.compareAtMinor) > BigInt(p.priceMinor)
      ? Math.round((1 - Number(p.priceMinor) / Number(p.compareAtMinor)) * 100)
      : 0;
  return (
    <Link href={`${base}/p/${p.slug}`} className="group block rounded-[var(--store-panel,24px)] bg-surface p-2 outline-offset-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="relative aspect-[var(--store-photo,4/5)] overflow-hidden rounded-[var(--store-card,18px)] bg-sunken" style={{ background: img?.color ?? undefined }}>
        {img?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.src}
            srcSet={img.thumb ? `${img.thumb} 320w, ${img.src} 800w` : undefined}
            sizes="(min-width: 1024px) 25vw, 50vw"
            alt=""
            loading={priority ? "eager" : "lazy"}
            className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${soldOut ? "opacity-55 grayscale-[35%]" : ""}`}
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-faint"><ImageIcon size={28} /></span>
        )}
        {soldOut ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2.5 py-1 font-display text-[12px] font-bold text-white">
            {p.status === "sold" ? t(locale, "product.sold") : t(locale, "product.soldOut")}
          </span>
        ) : off >= 5 ? (
          <span className="num absolute left-2.5 top-2.5 rounded-full bg-accent px-2.5 py-1 font-display text-[12px] font-bold text-accent-fg">−{off}%</span>
        ) : null}
      </div>
      <div className="px-1.5 pb-1.5 pt-2.5">
        <p className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink">{p.title}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          {p.priceMinor ? (
            <span className="num font-display text-[17px] font-extrabold tracking-[-0.02em]">{formatMoney(BigInt(p.priceMinor), p.currency)}</span>
          ) : (
            <span className="font-display text-[14px] font-bold text-accent-ink">{t(locale, "product.askPrice")}</span>
          )}
          {p.compareAtMinor && off ? <span className="num text-xs text-faint line-through">{formatMoney(BigInt(p.compareAtMinor), p.currency)}</span> : null}
        </p>
      </div>
    </Link>
  );
}
