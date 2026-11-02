"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
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

  if (!cart) return <div className="skeleton h-40 rounded-xl" />;
  if (!cart.lines.length) {
    return (
      <div className="card py-14 text-center">
        <p className="text-mist">{t(locale, "cart.empty")}</p>
        <Link href={base || "/"} className="mt-4 inline-block font-medium text-[var(--shop-accent)]">{t(locale, "cart.continue")}</Link>
      </div>
    );
  }
  const blocked = cart.lines.some((l) => l.problem);
  return (
    <div className="space-y-4">
      <div className="card divide-y divide-line">
        {cart.lines.map((l) => (
          <div key={l.variantId} className="flex gap-3 p-3">
            <Link href={`${base}/p/${l.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper-muted">
              {l.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`${base}/p/${l.slug}`} className="line-clamp-2 text-sm font-medium">{l.title}</Link>
              <p className="text-sm tabular-nums">{l.unitPriceMinor ? formatMoney(l.unitPriceMinor, l.currency) : ""}</p>
              {l.problem ? (
                <p className="text-xs text-danger">{l.problem === "insufficient" ? t(locale, "cart.insufficient", { n: l.maxQty }) : t(locale, "cart.unavailable")}</p>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button aria-label="−" onClick={() => setQty(l.variantId, l.quantity - 1)} className="rounded-lg border border-line p-1"><Minus size={14} /></button>
                <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                <button aria-label="+" disabled={l.quantity >= l.maxQty} onClick={() => setQty(l.variantId, l.quantity + 1)} className="rounded-lg border border-line p-1 disabled:opacity-40"><Plus size={14} /></button>
                <button onClick={() => setQty(l.variantId, 0)} className="ml-auto flex items-center gap-1 text-xs text-mist hover:text-danger"><Trash2 size={13} /> {t(locale, "cart.remove")}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card flex items-center justify-between p-4">
        <span className="text-mist">{t(locale, "cart.subtotal")}</span>
        <span className="text-lg font-semibold tabular-nums">{formatMoney(cart.subtotalMinor, cart.currency)}</span>
      </div>
      {blocked ? null : (
        <Link href={`${base}/checkout`} className="flex h-12 items-center justify-center rounded-xl bg-[var(--shop-accent)] font-semibold text-white">
          {t(locale, "cart.checkout")}
        </Link>
      )}
    </div>
  );
}
