import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, MapPin, Store } from "lucide-react";
import { getStorefront } from "@/server/page";
import { getOrderForBuyer, serializeOrder } from "@/server/domain/orders";
import { normalizeSettings } from "@/server/domain/shops";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export const metadata = { title: "Order", robots: { index: false } };

const STEPS = ["placed", "confirmed", "shipped", "delivered"] as const;

export default async function BuyerOrderPage({ params, searchParams }: { params: Promise<{ shop: string; number: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: shopParam, number } = await params;
  const sp = await searchParams;
  const { shop, base, locale } = await getStorefront(shopParam);
  const n = Number(number);
  if (!Number.isInteger(n) || !sp.t) notFound();
  const raw = await getOrderForBuyer(shop.id, n, sp.t);
  if (!raw) notFound();
  const o = serializeOrder(raw);
  const settings = normalizeSettings(shop.settings);
  const at: Record<(typeof STEPS)[number], string | null> = { placed: o.placedAt, confirmed: o.confirmedAt, shipped: o.shippedAt, delivered: o.deliveredAt };
  const reached = STEPS.map((s) => Boolean(at[s]));
  const last = o.status === "completed" ? 3 : reached.lastIndexOf(true);
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "am" ? "am-ET" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : null;
  const cancelled = o.status === "cancelled";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className={cn("overflow-hidden rounded-[20px] px-5 pb-5 pt-6 text-center", cancelled ? "bg-sunken" : "bg-accent text-accent-fg")}>
        <span className={cn("mx-auto grid h-12 w-12 place-items-center rounded-full", cancelled ? "bg-surface text-mist" : "bg-white/20")}>
          <Check size={24} strokeWidth={3} />
        </span>
        <p className="mt-3 text-sm font-semibold opacity-85">{shop.name}</p>
        <h1 className="num mt-0.5 font-display text-[26px] font-bold leading-tight">{sp.new ? t(locale, "order.placed", { n: o.number }) : `#${o.number}`}</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] opacity-90">
          {sp.new && !cancelled ? t(locale, "order.placedBody") : t(locale, `order.status.${o.status}` as "order.status.placed")}
        </p>
        {cancelled && o.cancelReason ? <p className="mt-2 text-sm text-mist">{o.cancelReason}</p> : null}
      </section>

      {!cancelled ? (
        <section className="rounded-[18px] bg-surface p-5 ring-1 ring-line">
          <ol className="relative">
            {STEPS.map((s, i) => {
              const done = i <= last;
              const current = i === last && o.status !== "completed" && o.status !== "delivered";
              return (
                <li key={s} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {i < STEPS.length - 1 ? <span aria-hidden className={cn("absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5 rounded-full", i < last ? "bg-accent" : "bg-line")} /> : null}
                  <span className={cn("relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-accent text-accent-fg" : "bg-surface ring-2 ring-line")}>
                    {done ? <Check size={13} strokeWidth={3} /> : null}
                    {current ? <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-25 motion-reduce:hidden" /> : null}
                  </span>
                  <div className="-mt-0.5">
                    <p className={cn("text-[15px] font-semibold", !done && "text-faint")}>{t(locale, `order.step.${s}` as "order.step.placed")}</p>
                    {at[s] ? <p className="num text-[13px] text-mist">{when(at[s])}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line">
        <h2 className="border-b border-line px-5 py-3 font-display font-bold">{t(locale, "order.items")}</h2>
        <ul className="divide-y divide-line">
          {o.lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-3">
              {l.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image} alt="" className="h-12 w-12 rounded-[10px] object-cover ring-1 ring-line" />
              ) : <span className="h-12 w-12 rounded-[10px] bg-sunken" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.title}{l.quantity > 1 ? <span className="num text-mist"> × {l.quantity}</span> : null}</span>
              <span className="num text-sm font-semibold">{formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), o.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line bg-canvas px-5 py-3.5 text-sm">
          {BigInt(o.deliveryFeeMinor) > 0n ? <div className="flex justify-between text-mist"><dt>{t(locale, "checkout.deliveryFee")}</dt><dd className="num">{formatMoney(BigInt(o.deliveryFeeMinor), o.currency)}</dd></div> : null}
          <div className="flex items-baseline justify-between">
            <dt className="font-semibold">{o.paymentStatus === "paid" ? t(locale, "order.paid") : t(locale, "order.toPay")}</dt>
            <dd className="num font-display text-xl font-bold">{formatMoney(BigInt(o.totalMinor), o.currency)}</dd>
          </div>
        </dl>
        <div className="flex gap-3 border-t border-line px-5 py-3.5 text-sm">
          {o.fulfillment === "pickup" ? <Store size={17} className="mt-0.5 shrink-0 text-mist" /> : <MapPin size={17} className="mt-0.5 shrink-0 text-mist" />}
          <p>
            <span className="block text-mist">{o.fulfillment === "pickup" ? t(locale, "order.pickupFrom") : t(locale, "order.deliverTo")}</span>
            <span className="font-medium">{o.fulfillment === "pickup" ? settings.delivery.pickupAddress ?? shop.name : o.address}</span>
          </p>
        </div>
      </section>

      <Link href={base || "/"} className="flex h-12 items-center justify-center rounded-[14px] bg-surface text-[15px] font-semibold ring-1 ring-line-strong hover:bg-sunken">
        {t(locale, "cart.continue")}
      </Link>
    </div>
  );
}
