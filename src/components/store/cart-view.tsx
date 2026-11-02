"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { t, type Locale } from "@/i18n";
import { useToast } from "@/components/ui/toast";
import { CART_EVENT } from "@/components/store/cart-count";

export type Cart = {
  lines: { variantId: string; slug: string; title: string; image: string | null; quantity: number; unitPriceMinor: string | null; currency: string; available: boolean; maxQty: number; problem: string | null }[];
  subtotalMinor: string;
  currency: string;
  count: number;
};

export function CartView({ shop, base, locale }: { shop: string; base: string; locale: Locale }) {
  const toast = useToast();
  const [cart, setCart] = useState<Cart | null>(null);
  useEffect(() => {
    api<Cart>(`/api/storefront/${shop}/cart`).then(setCart).catch(() => setCart({ lines: [], subtotalMinor: "0", currency: "ETB", count: 0 }));
  }, [shop]);

  async function setQty(variantId: string, quantity: number) {
    try {
      const next = await api<Cart>(`/api/storefront/${shop}/cart`, { method: "PATCH", body: { variantId, quantity } });
      setCart(next);
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: next.count }));
    } catch (err) {
      toast(err instanceof Error ? err.message : t(locale, "common.error"), "error");
    }
  }

  if (!cart) return <div className="skeleton h-40 rounded-[18px]" />;
  if (!cart.lines.length) {
    return (
      <div className="flex flex-col items-center rounded-[18px] bg-surface px-6 py-16 text-center ring-1 ring-line">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink-soft"><ShoppingBag size={22} /></span>
        <p className="font-display text-lg font-bold">{t(locale, "cart.empty")}</p>
        <Link href={base || "/"} className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-accent-fg hover:bg-accent-hover">{t(locale, "cart.continue")}</Link>
      </div>
    );
  }
  const blocked = cart.lines.some((l) => l.problem);
  const checkout = (
    <Link
      href={blocked ? "#" : `${base}/checkout`}
      aria-disabled={blocked}
      className={cn("flex h-12 items-center justify-center rounded-[14px] bg-accent text-[15px] font-bold text-accent-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-accent-hover", blocked && "pointer-events-none opacity-50")}
    >
      {t(locale, "cart.checkout")}
    </Link>
  );
  return (
    <div className="grid gap-5 pb-24 md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:pb-0">
      <ul className="divide-y divide-line rounded-[18px] bg-surface ring-1 ring-line">
        {cart.lines.map((l) => (
          <li key={l.variantId} className="flex gap-3.5 p-3.5 sm:p-4">
            <Link href={`${base}/p/${l.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-[12px] bg-sunken">
              {l.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <Link href={`${base}/p/${l.slug}`} className="line-clamp-2 text-[15px] font-semibold leading-snug">{l.title}</Link>
                <button onClick={() => setQty(l.variantId, 0)} aria-label={`${t(locale, "cart.remove")}: ${l.title}`} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
              </div>
              {l.problem ? (
                <p className="mt-0.5 text-xs font-semibold text-danger">{l.problem === "insufficient" ? t(locale, "cart.insufficient", { n: l.maxQty }) : t(locale, "cart.unavailable")}</p>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                <div className="flex items-center rounded-full ring-1 ring-line-strong">
                  <button aria-label="Decrease quantity" onClick={() => setQty(l.variantId, l.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sunken"><Minus size={14} /></button>
                  <span className="num w-7 text-center text-sm font-semibold" aria-live="polite">{l.quantity}</span>
                  <button aria-label="Increase quantity" disabled={l.quantity >= l.maxQty} onClick={() => setQty(l.variantId, l.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sunken disabled:opacity-35"><Plus size={14} /></button>
                </div>
                <span className="num font-display font-bold">{l.unitPriceMinor ? formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), l.currency) : ""}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <aside className="rounded-[18px] bg-surface p-4 ring-1 ring-line md:sticky md:top-20">
        <div className="flex items-baseline justify-between">
          <span className="text-mist">{t(locale, "cart.subtotal")}</span>
          <span className="num font-display text-xl font-bold">{formatMoney(BigInt(cart.subtotalMinor), cart.currency)}</span>
        </div>
        <p className="mt-1 text-xs text-mist">{t(locale, "cart.feesAtCheckout")}</p>
        <div className="mt-4 hidden md:block">{checkout}</div>
        <Link href={base || "/"} className="mt-3 hidden text-center text-sm font-semibold text-accent-ink hover:underline md:block">{t(locale, "cart.continue")}</Link>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-bar backdrop-blur-md md:hidden">{checkout}</div>
    </div>
  );
}
