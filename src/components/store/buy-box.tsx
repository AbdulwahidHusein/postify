"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { t, type Locale } from "@/i18n";
import { useToast } from "@/components/ui/toast";
import { CART_EVENT } from "@/components/store/cart-count";

export function BuyBox({
  shop, base, locale, productId, variantId, hasPrice, available, sold, stock, sourceCode, autoOrder,
}: {
  shop: string; base: string; locale: Locale; productId: string; variantId: string | null; hasPrice: boolean;
  available: boolean; sold: boolean; stock: number | null; sourceCode: string | null; autoOrder: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"cart" | "order" | "ask" | null>(null);
  const autoRan = useRef(false);

  async function add(goCheckout: boolean) {
    if (!variantId) return;
    setBusy(goCheckout ? "order" : "cart");
    try {
      const cart = await api<{ count: number }>(`/api/storefront/${shop}/cart`, { body: { variantId, quantity: 1, sourceCode } });
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: cart.count }));
      if (goCheckout) router.push(`${base}/checkout`);
      else toast(t(locale, "product.added"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t(locale, "common.error"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    setBusy("ask");
    try {
      const { conversationId } = await api<{ conversationId: string }>(`/api/storefront/${shop}/conversations`, { body: { productId, sourceCode } });
      router.push(`/inbox/${conversationId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      toast(err instanceof Error ? err.message : t(locale, "common.error"), "error");
      setBusy(null);
    }
  }

  // Arriving from the post's Order button: go straight to checkout.
  useEffect(() => {
    if (autoOrder && !autoRan.current && available && hasPrice) {
      autoRan.current = true;
      void add(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOrder, available, hasPrice]);

  const canBuy = available && hasPrice && Boolean(variantId);
  return (
    <div className="mt-5 space-y-2">
      {canBuy ? (
        <>
          <button onClick={() => add(true)} disabled={busy !== null} className="h-12 w-full rounded-xl bg-[var(--shop-accent)] font-semibold text-white disabled:opacity-60">
            {busy === "order" ? "…" : t(locale, "product.orderNow")}
          </button>
          <button onClick={() => add(false)} disabled={busy !== null} className="h-12 w-full rounded-xl border border-line-strong font-semibold disabled:opacity-60">
            {busy === "cart" ? "…" : t(locale, "product.addToCart")}
          </button>
          {stock !== null && stock > 0 && stock <= 5 ? <p className="text-xs text-warning">{t(locale, "product.inStock", { n: stock })}</p> : null}
        </>
      ) : (
        <p className="rounded-xl bg-paper-muted px-4 py-3 text-center text-sm font-medium">
          {sold || !available ? (sold ? t(locale, "product.sold") : t(locale, "product.soldOut")) : t(locale, "product.askPrice")}
        </p>
      )}
      <button onClick={ask} disabled={busy !== null} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line font-medium disabled:opacity-60">
        <MessageCircle size={18} /> {busy === "ask" ? "…" : t(locale, "product.askSeller")}
      </button>
    </div>
  );
}
