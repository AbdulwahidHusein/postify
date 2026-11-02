import { Check, MessageCircle, Package, Send, ShoppingBag, TrendingUp } from "lucide-react";
import type { Locale } from "@/i18n/catalog";
import { cn } from "@/lib/utils";
import { GoodsMark } from "@/components/brand";
import { landingT } from "@/components/landing/mockups";

/**
 * Product scenes for the landing page, drawn from real UI pieces (not
 * screenshots) so they stay crisp, light and translated. All decorative:
 * the page text carries the meaning.
 */

const money = (locale: Locale, n: string) => (locale === "am" ? `${n} ብር` : `ETB ${n}`);

/** A channel post with the buttons Goods adds. */
export function TelegramPost({ locale, className }: { locale: Locale; className?: string }) {
  const t = landingT(locale);
  return (
    <div aria-hidden className={cn("w-[300px] overflow-hidden rounded-[26px] bg-white text-[#111] shadow-[0_30px_60px_-24px_rgb(0_0_0/0.45)]", className)}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#111] font-display text-[12px] font-bold text-white">AT</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-[14px] font-bold">{t("mock_channel")}</span>
          <span className="block text-[11px] font-semibold text-[#6e6a63]">{t("mock_subscribers", { count: "18,240" })}</span>
        </span>
        <Send size={15} className="ml-auto text-[#1279ad]" />
      </div>
      <div className="relative h-[210px] bg-[#f2ece7]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/phone.webp" alt="" className="h-full w-full object-cover" />
      </div>
      <div className="px-3.5 pb-2 pt-2.5 text-[13px] leading-[1.45]">
        <p className="font-semibold">{t("mock_caption")}</p>
        <p className="mt-1 font-display font-bold">{t("mock_price")}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
        <span className="relative grid h-10 place-items-center rounded-[12px] bg-[#ff5a36] font-display text-[13px] font-bold">
          {t("btn_order")}
          <span className="landing-tap absolute right-3 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-black/15" />
        </span>
        <span className="grid h-10 place-items-center rounded-[12px] bg-[#f2ece7] font-display text-[13px] font-bold">{t("btn_ask")}</span>
      </div>
    </div>
  );
}

/** The order notification the seller gets a second later. */
export function OrderPing({ locale, className }: { locale: Locale; className?: string }) {
  const t = landingT(locale);
  return (
    <div aria-hidden className={cn("flex w-[300px] items-center gap-3 rounded-[22px] bg-[#ff5a36] p-3.5 text-[#111] shadow-[0_24px_48px_-20px_rgb(255_90_54/0.65)]", className)}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#111] text-[#ff5a36]"><ShoppingBag size={20} strokeWidth={2.4} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between font-display text-[15px] font-extrabold">{t("mock_new_order")}<span className="text-[11px] font-bold opacity-70">{t("mock_now")}</span></span>
        <span className="block truncate text-[13px] font-bold opacity-80">{t("mock_order_line")}</span>
      </span>
    </div>
  );
}

/** A buyer-facing store on a phone, in the seller's own theme. */
export function StorePhone({ locale, theme = "bold", className }: { locale: Locale; theme?: "bold" | "night" | "clean"; className?: string }) {
  const t = landingT(locale);
  const night = theme === "night";
  const accent = theme === "bold" ? "#2f5bff" : theme === "night" ? "#c8f03c" : "#0f766e";
  const items = [
    { img: "/landing/headphones.webp", key: "mock_product_headphones", price: "6,450" },
    { img: "/landing/watch.webp", key: "mock_product_watch", price: "7,200" },
    { img: "/landing/perfume.webp", key: "mock_product_perfume", price: "3,950" },
    { img: "/landing/phone.webp", key: "mock_product_iphone", price: "92,000" },
  ];
  return (
    <div aria-hidden className={cn("w-[250px] rounded-[40px] p-[8px] shadow-[0_30px_60px_-24px_rgb(0_0_0/0.5)]", night ? "bg-[#2a2d36]" : "bg-[#111]", className)}>
      <div className={cn("h-[500px] overflow-hidden rounded-[32px]", night ? "bg-[#0e0f13] text-[#f2f4f7]" : theme === "clean" ? "bg-[#f8f4f1] text-[#111]" : "bg-white text-[#111]")}>
        <div className="flex items-center justify-between px-4 pb-2 pt-5">
          <b className="font-display text-[15px] font-extrabold tracking-[-0.03em]">{theme === "night" ? "kicks" : theme === "clean" ? "Selam Home" : "ADDIS"}<span style={{ color: accent }}>{theme === "night" ? ".et" : theme === "clean" ? "" : "TECH"}</span></b>
          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: night ? accent : "#111", color: night ? "#0e0f13" : "#fff" }}><ShoppingBag size={13} /></span>
        </div>
        <div className={cn("mx-3 flex h-[120px] items-center justify-between overflow-hidden rounded-[20px] pl-4", night ? "bg-[#1a1c23]" : "")} style={night ? undefined : { background: `color-mix(in oklab, ${accent} 12%, white)` }}>
          <b className="font-display text-[19px] font-extrabold leading-[1.05] tracking-[-0.04em]">{t(theme === "night" ? "scene_hero_night" : theme === "clean" ? "scene_hero_clean" : "scene_hero_bold")}</b>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === "clean" ? "/landing/perfume.webp" : "/landing/headphones.webp"} alt="" className="h-[120px] w-[110px] object-contain" />
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {items.map((it) => (
            <div key={it.key} className={cn("rounded-[16px] p-1.5", night ? "bg-[#1a1c23]" : theme === "clean" ? "bg-white" : "bg-[#f4f4f5]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.img} alt="" className="h-[86px] w-full rounded-[12px] object-cover" />
              <p className="mt-1.5 truncate px-0.5 text-[10.5px] font-bold">{t(it.key)}</p>
              <p className="px-0.5 pb-0.5 font-display text-[12px] font-extrabold" style={night ? { color: accent } : undefined}>{money(locale, it.price)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Step 2: a plain caption becomes a product. */
export function CaptionToProduct({ locale }: { locale: Locale }) {
  const t = landingT(locale);
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="max-w-[260px] rounded-[18px] rounded-bl-[6px] bg-white px-3.5 py-2.5 text-[13.5px] font-semibold leading-snug shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
        <span lang="am">{t("scene_caption")}</span>
      </div>
      <div className="ml-6 rounded-[18px] bg-[#111] p-3.5 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-white/60"><GoodsMark size={14} tone="coral" /> {t("scene_read")}</p>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <span className="font-bold text-white/55">{t("scene_field_title")}</span><span className="font-display font-bold">{t("mock_product_headphones")}</span>
          <span className="font-bold text-white/55">{t("scene_field_price")}</span><span className="font-display font-bold text-[#ff5a36]">{money(locale, "4,500")}</span>
          <span className="font-bold text-white/55">{t("scene_field_category")}</span><span className="font-display font-bold">{t("scene_category")}</span>
        </div>
      </div>
    </div>
  );
}

/** Step 3: confirm with one tap. */
export function ConfirmCard({ locale }: { locale: Locale }) {
  const t = landingT(locale);
  return (
    <div aria-hidden className="rounded-[20px] bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/phone.webp" alt="" className="h-12 w-12 rounded-[12px] object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[14px] font-bold">{t("mock_product_iphone")}</span>
          <span className="block truncate text-[12px] font-semibold text-[#55534e]">{t("mock_order_line")}</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <span className="grid h-10 place-items-center rounded-full bg-[#ff5a36] font-display text-[13px] font-bold shadow-[0_3px_0_#111]">{t("mock_confirm")}</span>
        <span className="grid h-10 place-items-center rounded-full bg-[#f2ece7] px-4 font-display text-[13px] font-bold">{t("scene_slip")}</span>
      </div>
    </div>
  );
}

/** Seller dashboard, Coral style. */
export function DashboardScene({ locale, className }: { locale: Locale; className?: string }) {
  const t = landingT(locale);
  const rows = [
    { img: "/landing/phone.webp", key: "mock_product_iphone", total: "92,150", s: "mock_to_confirm", tone: "bg-[#ffefc7] text-[#7a4a00]" },
    { img: "/landing/headphones.webp", key: "mock_product_headphones", total: "6,450", s: "mock_on_the_way", tone: "bg-[#e6f4fb] text-[#0d5f87]" },
    { img: "/landing/perfume.webp", key: "mock_product_perfume", total: "3,950", s: "mock_delivered", tone: "bg-[#ddf3e8] text-[#146b45]" },
  ];
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-[28px] bg-[#f8f4f1] p-4 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)] ring-1 ring-black/5", className)}>
      <div className="flex items-center gap-2 pb-3">
        <GoodsMark size={22} />
        <b className="font-display text-[16px] font-extrabold tracking-[-0.04em]">goods</b>
        <span className="ml-auto flex gap-1">
          {[ShoppingBag, Package, MessageCircle].map((I, i) => <span key={i} className={cn("grid h-8 w-8 place-items-center rounded-full", i === 0 ? "bg-[#111] text-[#ff5a36]" : "bg-white")}><I size={14} /></span>)}
        </span>
      </div>
      <div className="grid grid-cols-[1.5fr_1fr] gap-2.5">
        <div className="rounded-[20px] bg-[#111] p-4 text-white">
          <p className="text-[11px] font-bold text-white/60">{t("mock_sales")}</p>
          <p className="mt-1 font-display text-[28px] font-extrabold leading-none tracking-[-0.04em]">{money(locale, "48,250")}</p>
          <div className="mt-3 flex h-14 items-end gap-1.5">
            {[40, 62, 50, 78, 66, 100, 58].map((h, i) => <span key={i} className={cn("flex-1 rounded-[5px]", i === 5 ? "bg-[#ff5a36]" : "bg-white/12")} style={{ height: `${h}%` }} />)}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-[20px] bg-[#ff5a36] p-4">
          <p className="text-[11px] font-bold">{t("mock_to_confirm")}</p>
          <p className="font-display text-[40px] font-extrabold leading-none tracking-[-0.05em]">3</p>
          <span className="grid h-8 w-8 place-items-center self-end rounded-full bg-[#111] text-[#ff5a36]"><TrendingUp size={14} /></span>
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5 rounded-[20px] bg-white p-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5 rounded-[14px] px-1.5 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.img} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
            <span className="min-w-0 flex-1 truncate font-display text-[12.5px] font-bold">{t(r.key)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", r.tone)}>{t(r.s)}</span>
            <span className="w-[74px] text-right font-display text-[12.5px] font-extrabold">{money(locale, r.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CheckItem({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", dark ? "bg-[#ff5a36] text-[#111]" : "bg-[#111] text-[#ff5a36]")}><Check size={14} strokeWidth={3} /></span>
      <span>{children}</span>
    </li>
  );
}
