import { ArrowLeft, BarChart3, Check, Home, MessageCircle, Package, Send, ShoppingBag, Users } from "lucide-react";
import { tc, type Locale } from "@/i18n/catalog";
import { cn } from "@/lib/utils";

/**
 * Product shots for the landing page, built from real UI rather than
 * screenshots so they stay sharp, light and translated.
 */

type L = (key: string, vars?: Record<string, string | number>) => string;
export const landingT = (locale: Locale): L => (key, vars) => tc(locale, `landing.${key}`, vars);

const ORDERS = [
  { img: "/landing/phone.webp", nameKey: "mock_product_iphone", whoEn: "Hana T.", whoAm: "ሀና ተ.", totalEn: "ETB 92,150", totalAm: "92,150 ብር", status: "to_confirm" },
  { img: "/landing/headphones.webp", nameKey: "mock_product_headphones", whoEn: "Dawit B.", whoAm: "ዳዊት በ.", totalEn: "ETB 6,450", totalAm: "6,450 ብር", status: "on_the_way" },
  { img: "/landing/perfume.webp", nameKey: "mock_product_perfume", whoEn: "Selam G.", whoAm: "ሰላም ግ.", totalEn: "ETB 3,950", totalAm: "3,950 ብር", status: "delivered" },
  { img: "/landing/watch.webp", nameKey: "mock_product_watch", whoEn: "Yonas A.", whoAm: "ዮናስ አ.", totalEn: "ETB 7,200", totalAm: "7,200 ብር", status: "delivered" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  to_confirm: "bg-adey-soft text-adey-ink",
  on_the_way: "bg-telegram-soft text-[#106a96]",
  delivered: "bg-brand-soft text-brand-ink",
};

function StatusPill({ status, t }: { status: string; t: L }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-semibold", STATUS_STYLE[status])}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {t(`mock_${status}`)}
    </span>
  );
}

/** A Telegram channel post with the buttons Goods adds, inside a phone. */
export function TelegramPhone({ locale, className }: { locale: Locale; className?: string }) {
  const t = landingT(locale);
  return (
    <div className={cn("relative w-[290px] rounded-[46px] bg-[#0f1216] p-[10px] shadow-[0_40px_80px_-30px_rgb(15_23_20/0.55)] ring-1 ring-black/10", className)}>
      <div className="relative overflow-hidden rounded-[37px] bg-[#dfe7d6]">
        <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
        {/* Telegram header */}
        <div className="relative z-10 flex items-center gap-2.5 bg-white/95 px-3 pb-2.5 pt-10 backdrop-blur">
          <ArrowLeft size={16} className="text-[#3a8bd6]" />
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#4b5d74] to-[#22303f] text-[11px] font-bold text-white">AT</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-[#111]">{t("mock_channel")}</span>
            <span className="block text-[11px] text-[#8a8f96]">{t("mock_subscribers", { count: "18,240" })}</span>
          </span>
        </div>
        {/* Chat */}
        <div className="px-2.5 pb-4 pt-3" style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / 0.35) 1px, transparent 1px)", backgroundSize: "12px 12px" }}>
          <div className="overflow-hidden rounded-[16px] rounded-bl-[5px] bg-white shadow-[0_1px_1px_rgb(0_0_0/0.08)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/phone.webp" alt="" width={270} height={230} className="block h-[230px] w-full object-cover" />
            <div className="px-2.5 pb-1.5 pt-2 text-[12.5px] leading-[1.45] text-[#111]">
              <p>{t("mock_caption")}</p>
              <p className="mt-1 font-semibold">{t("mock_price")}</p>
              <p className="mt-0.5 text-right text-[10px] text-[#a0a5ab]">3.4K 👁 10:24</p>
            </div>
          </div>
          <div className="mt-[3px] grid grid-cols-2 gap-[3px]">
            <span className="col-span-2 grid h-9 place-items-center rounded-[10px] bg-[#4f6b42]/70 text-[12.5px] font-semibold text-white backdrop-blur">
              {tc(locale, "tg.buttons.order_price", {
                order: tc(locale, "tg.buttons.order"),
                price: locale === "am" ? "92,000 ብር" : "ETB 92,000",
              })}
            </span>
            <span className="grid h-9 place-items-center rounded-[10px] bg-[#4f6b42]/70 text-[12px] font-semibold text-white backdrop-blur">{tc(locale, "tg.buttons.ask_seller")}</span>
            <span className="grid h-9 place-items-center rounded-[10px] bg-[#4f6b42]/70 text-[12px] font-semibold text-white backdrop-blur">{tc(locale, "tg.buttons.shop")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The notification a seller gets from the bot when someone orders. */
export function OrderToast({ locale, className }: { locale: Locale; className?: string }) {
  const t = landingT(locale);
  return (
    <div className={cn("w-[260px] rounded-2xl bg-white p-3 shadow-[0_24px_48px_-20px_rgb(15_23_20/0.45)] ring-1 ring-black/5", className)}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><ShoppingBag size={14} /></span>
        <span className="text-[12px] font-bold text-ink">{t("mock_new_order")} #1042</span>
        <span className="ml-auto text-[10px] text-faint">{t("mock_now")}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">{t("mock_order_line")}</p>
      <div className="mt-2.5 flex gap-1.5">
        <span className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-brand text-[11.5px] font-semibold text-white">
          <Check size={12} strokeWidth={3} /> {t("mock_confirm")}
        </span>
      </div>
    </div>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 200 48" className="h-12 w-full" aria-hidden>
      <defs>
        <linearGradient id="lg-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 40 C 20 38, 30 30, 45 32 S 70 18, 90 22 S 120 30, 135 20 S 165 6, 200 8 L 200 48 L 0 48 Z" fill="url(#lg-spark)" />
      <path d="M0 40 C 20 38, 30 30, 45 32 S 70 18, 90 22 S 120 30, 135 20 S 165 6, 200 8" fill="none" stroke="var(--brand)" strokeWidth="2" />
    </svg>
  );
}

/** A compact version of the seller dashboard. */
export function DashboardWindow({ locale, className, rows = 4 }: { locale: Locale; className?: string; rows?: number }) {
  const t = landingT(locale);
  const nav = [Home, ShoppingBag, Package, Users, MessageCircle, BarChart3, Send];
  return (
    <div className={cn("overflow-hidden rounded-[18px] bg-white shadow-[0_40px_80px_-36px_rgb(15_23_20/0.45)] ring-1 ring-black/[0.07]", className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-canvas px-3.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e7e9e4]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e7e9e4]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e7e9e4]" />
        <span className="mx-auto rounded-md bg-white px-10 py-0.5 text-[10px] text-faint ring-1 ring-line">goods.et/dashboard</span>
      </div>
      <div className="flex">
        <div className="hidden w-12 shrink-0 flex-col items-center gap-3 border-r border-line bg-canvas py-4 sm:flex">
          <span className="mb-1 grid h-6 w-6 place-items-center rounded-md bg-brand text-[10px] font-bold text-white">A</span>
          {nav.map((Icon, i) => (
            <span key={i} className={cn("grid h-7 w-7 place-items-center rounded-lg", i === 1 ? "bg-white text-brand shadow-sm ring-1 ring-line" : "text-faint")}>
              <Icon size={14} />
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="grid grid-cols-[0.7fr_1.3fr_1.3fr] gap-3">
            <div className="rounded-xl border border-line p-3">
              <p className="text-[10px] text-mist">{t("mock_orders")}</p>
              <p className="num mt-0.5 font-display text-[17px] font-bold text-ink">6</p>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="text-[10px] text-mist">{t("mock_sales")}</p>
              <p className="num mt-0.5 font-display text-[17px] font-bold text-ink">
                {locale === "am" ? "184,300 ብር" : "ETB 184,300"}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 pt-2">
              <Sparkline />
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            {ORDERS.slice(0, rows).map((o, i) => (
              <div key={o.nameKey} className={cn("flex items-center gap-2.5 px-3 py-2", i && "border-t border-line", i === 0 && "bg-adey-soft/40")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.img} alt="" width={28} height={28} className="h-7 w-7 rounded-md object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-ink">{t(o.nameKey)}</span>
                  <span className="block text-[10px] text-mist">#{1042 - i} · {locale === "am" ? o.whoAm : o.whoEn}</span>
                </span>
                <span className="num text-[11px] font-semibold text-ink">
                  {locale === "am" ? o.totalAm : o.totalEn}
                </span>
                <StatusPill status={o.status} t={t} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
