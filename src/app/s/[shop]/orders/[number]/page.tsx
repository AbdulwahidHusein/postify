import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getStorefront } from "@/server/page";
import { getOrderForBuyer, serializeOrder } from "@/server/domain/orders";
import { formatMoney } from "@/lib/money";
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
  const stepIdx = o.status === "completed" ? 3 : STEPS.indexOf(o.status as (typeof STEPS)[number]);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {sp.new ? (
        <div className="card flex items-start gap-3 border-success/30 bg-success/5 p-4">
          <CheckCircle2 className="mt-0.5 text-success" />
          <div>
            <p className="font-semibold">{t(locale, "order.placed", { n: o.number })}</p>
            <p className="text-sm text-mist">{t(locale, "order.placedBody")}</p>
          </div>
        </div>
      ) : (
        <h1 className="text-2xl font-semibold">#{o.number}</h1>
      )}
      <section className="card p-4">
        <p className="font-medium">{t(locale, `order.status.${o.status}` as "order.status.placed")}</p>
        {o.status !== "cancelled" ? (
          <div className="mt-3 flex gap-1.5">
            {STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? "bg-[var(--shop-accent)]" : "bg-paper-muted"}`} />)}
          </div>
        ) : o.cancelReason ? <p className="mt-1 text-sm text-mist">{o.cancelReason}</p> : null}
      </section>
      <section className="card divide-y divide-line">
        <h2 className="px-4 py-3 text-sm font-semibold">{t(locale, "order.items")}</h2>
        {o.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="truncate">{l.title} × {l.quantity}</span>
            <span className="tabular-nums">{formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), o.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between px-4 py-3 font-semibold"><span>{t(locale, "checkout.total")}</span><span className="tabular-nums">{formatMoney(o.totalMinor, o.currency)}</span></div>
        <p className="px-4 py-3 text-sm text-mist">{t(locale, "checkout.payOnDelivery")}</p>
      </section>
      <Link href={base || "/"} className="block text-center text-sm font-medium text-[var(--shop-accent)]">{t(locale, "cart.continue")}</Link>
    </div>
  );
}
