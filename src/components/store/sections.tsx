import Link from "next/link";
import { ArrowRight, Banknote, BadgeCheck, Clock, MapPin, Phone, RotateCcw, Send, Smartphone, Store, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { promoActive, storeHref, type SectionOf, type StoreSection } from "@/lib/store-design";
import { t, type Locale } from "@/i18n";
import { tc } from "@/i18n/catalog";
import { ProductCard } from "@/components/store/product-card";
import { Countdown } from "@/components/store/countdown";

type CardProduct = Parameters<typeof ProductCard>[0]["p"];

/** Everything a section might need, loaded once by the page. */
export type SectionData = {
  base: string;
  locale: Locale;
  shopName: string;
  channelUrl: string | null;
  channelTitle: string | null;
  imageUrl: (key: string) => string;
  categories: { name: string; count: number; image: string | null }[];
  featured: Record<string, { title: string | null; items: CardProduct[]; href: string | null }>;
  contact: { phone: string | null; telegramUsername: string | null; address: string | null };
  delivery: { deliveryEnabled: boolean; pickupEnabled: boolean; deliveryNote: string | null; pickupAddress: string | null };
  description: string | null;
  grid: ReactNode;
};

const btn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--store-btn,999px)] px-6 font-display text-[15px] font-bold shadow-[var(--store-btn-shadow,none)] transition-[transform,background-color,box-shadow] duration-150 hover:-translate-y-px active:translate-y-0.5 active:shadow-none";

function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[26px]">{children}</h2>
      {action}
    </div>
  );
}

const BG = {
  tint: "bg-accent-soft text-ink",
  accent: "bg-accent text-accent-fg",
  dark: "bg-[#111111] text-white",
  plain: "bg-surface text-ink",
} as const;

function Hero({ s, d }: { s: SectionOf<"hero">; d: SectionData }) {
  const href = storeHref(s.link, d);
  const img = s.imageKey ? d.imageUrl(s.imageKey) : null;
  const tall = s.height === "l" ? "min-h-[440px] sm:min-h-[520px]" : s.height === "s" ? "min-h-[200px] sm:min-h-[240px]" : "min-h-[300px] sm:min-h-[380px]";
  const onAccent = s.background === "accent";
  const cta = s.buttonLabel && href ? (
    <Link href={href} className={cn(btn, onAccent ? "bg-[#111111] text-white" : s.background === "dark" ? "bg-accent text-accent-fg" : "bg-accent text-accent-fg")}>
      {s.buttonLabel} <ArrowRight size={17} strokeWidth={2.6} />
    </Link>
  ) : null;
  const copy = (
    <>
      {s.heading ? <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[52px]">{s.heading}</h1> : null}
      {s.text ? <p className="mt-3 max-w-xl text-[16px] font-semibold opacity-85 sm:text-[17px]">{s.text}</p> : null}
      {cta ? <div className="mt-6">{cta}</div> : null}
    </>
  );

  if (s.layout === "image" && img) {
    return (
      <section className={cn("relative flex overflow-hidden rounded-[var(--store-panel,28px)] bg-ink text-white", tall)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="relative mt-auto w-full p-6 sm:p-10">{copy}</div>
      </section>
    );
  }
  return (
    <section className={cn("grid overflow-hidden rounded-[var(--store-panel,28px)]", BG[s.background], tall, s.layout === "split" && img ? "sm:grid-cols-[1.1fr_1fr]" : "")}>
      <div className="flex flex-col justify-center p-6 sm:p-10">{copy}</div>
      {s.layout === "split" && img ? (
        <div className="relative min-h-[220px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      ) : null}
    </section>
  );
}

function Categories({ s, d }: { s: SectionOf<"categories">; d: SectionData }) {
  if (d.categories.length < 2) return null;
  const items = d.categories.slice(0, 8);
  return (
    <section>
      <Heading>{s.title || tc(d.locale, "store.section.categories")}</Heading>
      <div className={cn("no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1", s.style === "tiles" && "sm:grid sm:grid-cols-4 sm:overflow-visible")}>
        {items.map((c) => (
          <Link
            key={c.name}
            href={`${d.base}/?category=${encodeURIComponent(c.name)}`}
            className={cn(
              "group shrink-0",
              s.style === "circles" ? "flex w-[84px] flex-col items-center gap-2 text-center sm:w-[104px]" : "flex w-[60%] items-center gap-3 rounded-[var(--store-card,20px)] bg-surface p-3 sm:w-auto",
            )}
          >
            <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-sunken transition-transform duration-200 group-hover:-translate-y-0.5", s.style === "circles" ? "h-[76px] w-[76px] rounded-full sm:h-[96px] sm:w-[96px]" : "h-16 w-16 rounded-[var(--store-card,16px)]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover" /> : <Store size={22} className="text-mist" />}
            </span>
            <span className="min-w-0 font-display text-[14px] font-bold leading-tight">
              {c.name.split(" > ").at(-1)}
              {s.style === "tiles" ? <span className="block text-[12px] font-semibold text-mist">{c.count}</span> : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Featured({ s, d }: { s: SectionOf<"featured">; d: SectionData }) {
  const f = d.featured[s.id];
  if (!f?.items.length) return null;
  return (
    <section>
      <Heading action={f.href ? <Link href={f.href} className="inline-flex items-center gap-1 font-display text-sm font-bold text-accent-ink hover:underline">{tc(d.locale, "store.section.viewAll")} <ArrowRight size={15} /></Link> : null}>
        {s.title || f.title || t(d.locale, "shop.products")}
      </Heading>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {f.items.map((p) => (
          <div key={p.slug} className="w-[46%] shrink-0 snap-start sm:w-[236px]"><ProductCard p={p} base={d.base} locale={d.locale} /></div>
        ))}
      </div>
    </section>
  );
}

function Promo({ s, d }: { s: SectionOf<"promo">; d: SectionData }) {
  if (!promoActive(s.endsAt)) return null;
  const href = storeHref(s.link, d);
  const bg = s.background === "accent" ? "bg-accent text-accent-fg" : s.background === "dark" ? "bg-[#111111] text-white" : "bg-accent-soft text-ink";
  return (
    <section className={cn("flex flex-col gap-5 rounded-[var(--store-panel,28px)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8", bg)}>
      <div>
        <h2 className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[36px]">{s.heading}</h2>
        {s.text ? <p className="mt-2 max-w-lg text-[15px] font-semibold opacity-85">{s.text}</p> : null}
      </div>
      <div className="flex flex-col gap-3 sm:items-end">
        {s.endsAt ? (
          <Countdown
            endsAt={s.endsAt}
            labels={{ endsIn: tc(d.locale, "store.section.endsIn"), days: tc(d.locale, "store.section.days"), hours: tc(d.locale, "store.section.hours"), mins: tc(d.locale, "store.section.mins") }}
          />
        ) : null}
        {s.buttonLabel && href ? (
          <Link href={href} className={cn(btn, s.background === "accent" ? "bg-[#111111] text-white" : "bg-accent text-accent-fg")}>
            {s.buttonLabel} <ArrowRight size={17} strokeWidth={2.6} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function TelegramJoin({ s, d }: { s: SectionOf<"telegram">; d: SectionData }) {
  if (!d.channelUrl) return null;
  return (
    <section className="flex flex-col gap-4 rounded-[var(--store-panel,28px)] bg-telegram p-6 text-white sm:flex-row sm:items-center sm:p-7">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15"><Send size={24} /></span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">{s.title || tc(d.locale, "store.section.telegramTitle")}</h2>
        <p className="mt-1 text-[15px] font-semibold opacity-90">{tc(d.locale, "store.section.telegramBody", { name: d.channelTitle ?? d.shopName })}</p>
      </div>
      <a href={d.channelUrl} className={cn(btn, "bg-white text-[#0d5f87]")}>{tc(d.locale, "store.section.telegramJoin")}</a>
    </section>
  );
}

const TRUST: Record<SectionOf<"trust">["items"][number], { icon: typeof Truck; key: string }> = {
  cod: { icon: Banknote, key: "store.trust.cod" },
  telebirr: { icon: Smartphone, key: "store.trust.telebirr" },
  delivery: { icon: Truck, key: "store.trust.delivery" },
  pickup: { icon: MapPin, key: "store.trust.pickup" },
  original: { icon: BadgeCheck, key: "store.trust.original" },
  returns: { icon: RotateCcw, key: "store.trust.returns" },
};

function Trust({ s, d }: { s: SectionOf<"trust">; d: SectionData }) {
  if (!s.items.length) return null;
  const note = (k: string) => (k === "delivery" ? d.delivery.deliveryNote : k === "pickup" ? d.delivery.pickupAddress : null);
  return (
    <section className={cn("grid gap-3", s.items.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
      {s.items.map((k) => {
        const it = TRUST[k];
        return (
          <div key={k} className="flex items-center gap-3 rounded-[var(--store-card,20px)] bg-surface p-3.5 sm:p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"><it.icon size={20} strokeWidth={2.2} /></span>
            <span className="min-w-0">
              <span className="block font-display text-[14px] font-bold leading-tight sm:text-[15px]">{tc(d.locale, it.key)}</span>
              {note(k) ? <span className="mt-0.5 block truncate text-[12px] font-semibold text-mist">{note(k)}</span> : null}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function Faq({ s, d }: { s: SectionOf<"faq">; d: SectionData }) {
  const items = s.items.filter((i) => i.q && i.a);
  if (!items.length) return null;
  return (
    <section>
      <Heading>{s.title || tc(d.locale, "store.section.faq")}</Heading>
      <div className="space-y-2">
        {items.map((i) => (
          <details key={i.q} className="group rounded-[var(--store-card,20px)] bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-display text-[16px] font-bold">
              {i.q}
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-lg leading-none transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="whitespace-pre-wrap px-5 pb-5 text-[15px] font-semibold text-ink-soft">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Story({ s, d }: { s: SectionOf<"story">; d: SectionData }) {
  const body = s.text || d.description;
  if (!body) return null;
  const img = s.imageKey ? d.imageUrl(s.imageKey) : null;
  return (
    <section className={cn("grid gap-6 overflow-hidden rounded-[var(--store-panel,28px)] bg-surface", img ? "sm:grid-cols-2" : "")}>
      {img ? (
        <div className="relative min-h-[240px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      ) : null}
      <div className={cn("flex flex-col justify-center p-6 sm:p-10", img && "sm:pl-2")}>
        <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em]">{s.title || t(d.locale, "shop.about")}</h2>
        <p className="mt-3 whitespace-pre-wrap text-[16px] font-semibold leading-relaxed text-ink-soft">{body}</p>
      </div>
    </section>
  );
}

function Contact({ s, d }: { s: SectionOf<"contact">; d: SectionData }) {
  const c = d.contact;
  if (!c.phone && !c.telegramUsername && !c.address && !d.channelUrl) return null;
  const maps = c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : null;
  return (
    <section className="rounded-[var(--store-panel,28px)] bg-surface p-6 sm:p-8">
      <Heading>{s.title || tc(d.locale, "store.section.contact")}</Heading>
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-3 text-[15px] font-semibold">
          {c.address ? <p className="flex items-start gap-3"><MapPin size={19} className="mt-0.5 shrink-0 text-accent-ink" /> {c.address}</p> : null}
          {s.hours ? <p className="flex items-start gap-3"><Clock size={19} className="mt-0.5 shrink-0 text-accent-ink" /> {s.hours}</p> : null}
          {c.phone ? <p className="flex items-center gap-3"><Phone size={19} className="shrink-0 text-accent-ink" /> <span className="num">{c.phone}</span></p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone ? <a href={`tel:${c.phone}`} className={cn(btn, "bg-accent text-accent-fg")}><Phone size={17} /> {tc(d.locale, "store.section.call")}</a> : null}
          {c.telegramUsername ? (
            <a href={`https://t.me/${c.telegramUsername.replace(/^@/, "")}`} className={cn(btn, "bg-telegram text-white")}><Send size={17} /> {tc(d.locale, "store.section.message")}</a>
          ) : d.channelUrl ? (
            <a href={d.channelUrl} className={cn(btn, "bg-telegram text-white")}><Send size={17} /> {t(d.locale, "shop.telegram")}</a>
          ) : null}
          {maps ? <a href={maps} target="_blank" rel="noreferrer" className={cn(btn, "border-2 border-ink bg-surface text-ink")}>{tc(d.locale, "store.section.directions")}</a> : null}
        </div>
      </div>
    </section>
  );
}

export function StoreSectionView({ s, d }: { s: StoreSection; d: SectionData }) {
  switch (s.type) {
    case "hero": return <Hero s={s} d={d} />;
    case "categories": return <Categories s={s} d={d} />;
    case "featured": return <Featured s={s} d={d} />;
    case "grid": return <section>{s.title ? <Heading>{s.title}</Heading> : null}{d.grid}</section>;
    case "promo": return <Promo s={s} d={d} />;
    case "telegram": return <TelegramJoin s={s} d={d} />;
    case "trust": return <Trust s={s} d={d} />;
    case "faq": return <Faq s={s} d={d} />;
    case "story": return <Story s={s} d={d} />;
    case "contact": return <Contact s={s} d={d} />;
  }
}
