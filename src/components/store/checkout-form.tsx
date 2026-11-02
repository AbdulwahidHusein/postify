"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, CreditCard, Send, Store, Truck } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { t, type Locale } from "@/i18n";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CART_EVENT } from "@/components/store/cart-count";
import type { Cart } from "@/components/store/cart-view";

type TgWebApp = {
  initData?: string;
  MainButton?: { setText(t: string): void; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; showProgress(): void; hideProgress(): void; enable(): void; disable(): void };
  requestContact?: (cb: (ok: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void;
};
const tgApp = () => (typeof window === "undefined" ? undefined : (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp);

export function CheckoutForm({
  shop, base, locale, delivery, pickup, prefill,
}: {
  shop: string; base: string; locale: Locale;
  delivery: { enabled: boolean; feeMinor: string; note: string | null };
  pickup: { enabled: boolean; address: string | null };
  prefill: { name: string; phone: string };
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [name, setName] = useState(prefill.name);
  const [phone, setPhone] = useState(prefill.phone);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(delivery.enabled ? "delivery" : "pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Cart>(`/api/storefront/${shop}/cart`).then(setCart).catch(() => undefined);
  }, [shop]);

  const fee = fulfillment === "delivery" ? BigInt(delivery.feeMinor || "0") : 0n;
  const total = cart ? BigInt(cart.subtotalMinor) + fee : 0n;
  const currency = cart?.currency ?? "ETB";
  const totalText = formatMoney(total, currency) ?? "";

  async function place() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { order } = await api<{ order: { number: number; accessToken: string } }>(`/api/storefront/${shop}/checkout`, {
        body: { contactName: name, contactPhone: phone, fulfillment, address: fulfillment === "delivery" ? address : null, notes: notes || null, paymentMethod: "on_delivery" },
      });
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: 0 }));
      router.replace(`${base}/orders/${order.number}?t=${order.accessToken}&new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "common.error"));
      setBusy(false);
    }
  }

  // Inside Telegram the native MainButton places the order.
  useEffect(() => {
    const mb = tgApp()?.MainButton;
    if (!tgApp()?.initData || !mb || !cart?.lines.length) return;
    mb.setText(t(locale, "checkout.place", { total: totalText }));
    mb.show();
    const handler = () => void place();
    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
      mb.hide();
    };
  });
  useEffect(() => {
    const mb = tgApp()?.MainButton;
    if (!mb) return;
    if (busy) mb.showProgress();
    else mb.hideProgress();
  }, [busy]);

  function sharePhone() {
    tgApp()?.requestContact?.((ok, res) => {
      const n = res?.responseUnsafe?.contact?.phone_number;
      if (ok && n) setPhone(n.startsWith("+") ? n : `+${n}`);
    });
  }

  if (cart && !cart.lines.length) {
    return (
      <div className="flex flex-col items-center rounded-[18px] bg-surface py-14 text-center ring-1 ring-line">
        <p className="font-display font-semibold">{t(locale, "cart.empty")}</p>
        <a href={base || "/"} className="mt-3 text-sm font-semibold text-accent-ink hover:underline">{t(locale, "cart.continue")}</a>
      </div>
    );
  }

  const option = (active: boolean) =>
    cn(
      "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3.5 text-sm transition-colors",
      active ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line-strong bg-surface hover:border-faint",
    );
  const inTelegram = Boolean(tgApp()?.initData);
  const canShareContact = Boolean(tgApp()?.requestContact) && inTelegram;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void place(); }} className="grid gap-5 pb-28 md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:pb-0">
      <div className="space-y-5">
        <Step n={1} title={t(locale, "checkout.contact")}>
          <Field label={t(locale, "checkout.name")} htmlFor="c-name"><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></Field>
          <Field label={t(locale, "checkout.phone")} htmlFor="c-phone" hint={t(locale, "checkout.phoneHint")}>
            <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXX" className="num" />
            {canShareContact ? (
              <button type="button" onClick={sharePhone} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-telegram hover:underline">
                <Send size={13} /> {t(locale, "checkout.useTelegramPhone")}
              </button>
            ) : null}
          </Field>
        </Step>

        <Step n={2} title={t(locale, "checkout.fulfillment")}>
          <div className="space-y-2">
            {delivery.enabled ? (
              <label className={option(fulfillment === "delivery")}>
                <input type="radio" name="f" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <Truck size={18} className="mt-px shrink-0 text-ink-soft" />
                <span className="flex-1">
                  <span className="flex justify-between gap-3 font-semibold"><span>{t(locale, "checkout.delivery")}</span><span className="num">{BigInt(delivery.feeMinor || "0") > 0n ? formatMoney(BigInt(delivery.feeMinor), currency) : t(locale, "product.freeDelivery")}</span></span>
                  {delivery.note ? <span className="mt-0.5 block text-mist">{delivery.note}</span> : null}
                </span>
              </label>
            ) : null}
            {pickup.enabled ? (
              <label className={option(fulfillment === "pickup")}>
                <input type="radio" name="f" checked={fulfillment === "pickup"} onChange={() => setFulfillment("pickup")} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <Store size={18} className="mt-px shrink-0 text-ink-soft" />
                <span className="flex-1">
                  <span className="block font-semibold">{t(locale, "checkout.pickup")}</span>
                  {pickup.address ? <span className="mt-0.5 block text-mist">{t(locale, "checkout.pickupAt", { address: pickup.address })}</span> : null}
                </span>
              </label>
            ) : null}
          </div>
          {fulfillment === "delivery" ? (
            <Field label={t(locale, "checkout.address")} htmlFor="c-addr" hint={t(locale, "checkout.addressHint")}>
              <Textarea id="c-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={300} autoComplete="street-address" className="min-h-0" />
            </Field>
          ) : null}
          <Field label={t(locale, "checkout.notes")} htmlFor="c-notes"><Input id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
        </Step>

        <Step n={3} title={t(locale, "checkout.payment")}>
          <div className="space-y-2" role="radiogroup" aria-label={t(locale, "checkout.payment")}>
            <label className={option(true)}>
              <input type="radio" name="pay" checked readOnly className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <Banknote size={18} className="mt-px shrink-0 text-ink-soft" />
              <span><span className="block font-semibold">{t(locale, "checkout.payOnDelivery")}</span><span className="mt-0.5 block text-mist">{t(locale, "checkout.payOnDeliveryHint")}</span></span>
            </label>
            <div
              role="radio"
              aria-checked="false"
              aria-disabled="true"
              tabIndex={-1}
              onClick={() => void api(`/api/storefront/${shop}/events`, { body: { type: "online_payment_interest" } }).catch(() => undefined)}
              className="flex cursor-not-allowed items-start gap-3 rounded-[14px] border border-dashed border-line-strong p-3.5 text-sm"
            >
              <input type="radio" disabled className="mt-0.5 h-4 w-4" />
              <CreditCard size={18} className="mt-px shrink-0 text-faint" />
              <span className="flex-1 text-faint">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-mist">
                  {t(locale, "checkout.payOnline")}
                  <span className="rounded-full bg-adey-soft px-2 py-0.5 text-[11px] font-bold text-adey-ink">{t(locale, "checkout.comingSoon")}</span>
                </span>
                <span className="mt-0.5 block">{t(locale, "checkout.payOnlineHint")}</span>
              </span>
            </div>
          </div>
        </Step>
      </div>

      <aside className="rounded-[18px] bg-surface ring-1 ring-line md:sticky md:top-20">
        <h2 className="border-b border-line px-4 py-3 font-display font-bold">{t(locale, "checkout.summary")}</h2>
        <ul className="divide-y divide-line">
          {cart?.lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-3 px-4 py-3">
              <span className="relative h-12 w-12 shrink-0 overflow-visible">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image} alt="" className="h-12 w-12 rounded-[10px] object-cover ring-1 ring-line" />
                ) : <span className="block h-12 w-12 rounded-[10px] bg-sunken" />}
                {l.quantity > 1 ? <span className="num absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">{l.quantity}</span> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.title}</span>
              <span className="num text-sm font-semibold">{l.unitPriceMinor ? formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), l.currency) : ""}</span>
            </li>
          ))}
          {!cart ? <li className="p-4"><div className="skeleton h-12 rounded-xl" /></li> : null}
        </ul>
        <dl className="space-y-1.5 border-t border-line bg-canvas px-4 py-3 text-sm md:rounded-b-[18px]">
          <div className="flex justify-between text-mist"><dt>{t(locale, "cart.subtotal")}</dt><dd className="num">{cart ? formatMoney(BigInt(cart.subtotalMinor), currency) : ""}</dd></div>
          {fulfillment === "delivery" ? <div className="flex justify-between text-mist"><dt>{t(locale, "checkout.deliveryFee")}</dt><dd className="num">{fee > 0n ? formatMoney(fee, currency) : t(locale, "product.freeDelivery")}</dd></div> : null}
          <div className="flex items-baseline justify-between border-t border-line pt-2"><dt className="font-semibold">{t(locale, "checkout.total")}</dt><dd className="num font-display text-xl font-bold">{totalText}</dd></div>
        </dl>
        <div className="hidden p-4 pt-0 md:block md:bg-canvas md:rounded-b-[18px]">
          {error ? <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
          <button type="submit" disabled={busy || !cart} className="h-12 w-full rounded-[14px] bg-accent text-[15px] font-bold text-accent-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-accent-hover disabled:opacity-60">
            {busy ? t(locale, "checkout.placing") : t(locale, "checkout.place", { total: totalText })}
          </button>
          <p className="mt-2 text-center text-xs text-mist">{t(locale, "checkout.noPaymentNow")}</p>
        </div>
      </aside>

      {/* Phones outside Telegram: sticky place-order bar. Inside Telegram the MainButton does this. */}
      {!inTelegram ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-bar backdrop-blur-md md:hidden">
          {error ? <p role="alert" className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
          <button type="submit" disabled={busy || !cart} className="h-12 w-full rounded-[14px] bg-accent text-[15px] font-bold text-accent-fg disabled:opacity-60">
            {busy ? t(locale, "checkout.placing") : t(locale, "checkout.place", { total: totalText })}
          </button>
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger md:hidden">{error}</p>
      ) : null}
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] bg-surface p-4 ring-1 ring-line sm:p-5">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-[17px] font-bold">
        <span className="num grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
