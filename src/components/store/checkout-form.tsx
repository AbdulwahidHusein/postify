"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    return <p className="card py-12 text-center text-mist">{t(locale, "cart.empty")}</p>;
  }

  const option = (active: boolean) =>
    cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", active ? "border-[var(--shop-accent)] bg-[color-mix(in_oklab,var(--shop-accent)_6%,white)]" : "border-line");

  return (
    <form onSubmit={(e) => { e.preventDefault(); void place(); }} className="space-y-5">
      <section className="card space-y-4 p-4">
        <h2 className="font-semibold">{t(locale, "checkout.contact")}</h2>
        <Field label={t(locale, "checkout.name")}><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></Field>
        <Field label={t(locale, "checkout.phone")} hint={t(locale, "checkout.phoneHint")}>
          <div className="flex gap-2">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXX" />
            {tgApp()?.requestContact ? <button type="button" onClick={sharePhone} className="shrink-0 rounded-lg border border-line px-3 text-sm">📱</button> : null}
          </div>
        </Field>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t(locale, "checkout.fulfillment")}</h2>
        {delivery.enabled ? (
          <label className={option(fulfillment === "delivery")}>
            <input type="radio" name="f" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} className="mt-0.5" />
            <span className="flex-1">
              <b>{t(locale, "checkout.delivery")}</b> · {formatMoney(delivery.feeMinor || "0", currency)}
              {delivery.note ? <span className="block text-mist">{delivery.note}</span> : null}
            </span>
          </label>
        ) : null}
        {pickup.enabled ? (
          <label className={option(fulfillment === "pickup")}>
            <input type="radio" name="f" checked={fulfillment === "pickup"} onChange={() => setFulfillment("pickup")} className="mt-0.5" />
            <span className="flex-1">
              <b>{t(locale, "checkout.pickup")}</b>
              {pickup.address ? <span className="block text-mist">{t(locale, "checkout.pickupAt", { address: pickup.address })}</span> : null}
            </span>
          </label>
        ) : null}
        {fulfillment === "delivery" ? (
          <Field label={t(locale, "checkout.address")} hint={t(locale, "checkout.addressHint")}>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={300} autoComplete="street-address" />
          </Field>
        ) : null}
        <Field label={t(locale, "checkout.notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t(locale, "checkout.payment")}</h2>
        <label className={option(true)}>
          <input type="radio" name="pay" checked readOnly className="mt-0.5" />
          <span><b>{t(locale, "checkout.payOnDelivery")}</b><span className="block text-mist">{t(locale, "checkout.payOnDeliveryHint")}</span></span>
        </label>
        <div
          role="radio"
          aria-checked="false"
          aria-disabled="true"
          tabIndex={-1}
          onClick={() => void api(`/api/storefront/${shop}/events`, { body: { type: "online_payment_interest" } }).catch(() => undefined)}
          className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed border-line p-3 text-sm opacity-60"
        >
          <input type="radio" disabled className="mt-0.5" />
          <span className="flex-1">
            <b>{t(locale, "checkout.payOnline")}</b>
            <span className="ml-2 rounded bg-paper-muted px-1.5 py-0.5 text-[11px] font-semibold text-mist">{t(locale, "checkout.comingSoon")}</span>
            <span className="block text-mist">{t(locale, "checkout.payOnlineHint")}</span>
          </span>
        </div>
      </section>

      <section className="card space-y-1.5 p-4 text-sm">
        {cart?.lines.map((l) => (
          <div key={l.variantId} className="flex justify-between gap-3"><span className="truncate">{l.title} × {l.quantity}</span><span className="tabular-nums">{l.unitPriceMinor ? formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), l.currency) : ""}</span></div>
        ))}
        {fulfillment === "delivery" ? <div className="flex justify-between text-mist"><span>{t(locale, "checkout.deliveryFee")}</span><span className="tabular-nums">{formatMoney(fee, currency)}</span></div> : null}
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>{t(locale, "checkout.total")}</span><span className="tabular-nums">{totalText}</span></div>
      </section>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy || !cart} className="h-12 w-full rounded-xl bg-[var(--shop-accent)] font-semibold text-white disabled:opacity-60">
        {busy ? t(locale, "checkout.placing") : t(locale, "checkout.place", { total: totalText })}
      </button>
    </form>
  );
}
