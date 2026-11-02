"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const askButton = (compact: boolean) => (
    <button
      onClick={ask}
      disabled={busy !== null}
      aria-label={t(locale, "product.askSeller")}
      className={cn(
        "flex h-14 shrink-0 items-center justify-center gap-2 rounded-[var(--store-btn,999px)] border-2 border-ink bg-surface font-display font-bold text-ink transition-[transform,background-color] duration-150 hover:bg-canvas active:scale-[0.97] disabled:opacity-60",
        compact ? "w-14" : "w-full",
      )}
    >
      <MessageCircle size={20} strokeWidth={2.2} />
      {compact ? null : busy === "ask" ? "…" : t(locale, "product.askSeller")}
    </button>
  );

  return (
    <>
      {stock !== null && stock > 0 && stock <= 3 && canBuy ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-adey-soft px-3 py-1.5 font-display text-[13px] font-bold text-adey-ink">
          <span className="h-2 w-2 rounded-full bg-adey" /> {t(locale, "product.inStock", { n: stock })}
        </p>
      ) : null}

      {/* Desktop: inline */}
      <div className="mt-6 hidden space-y-3 md:block">
        {canBuy ? (
          <div className="flex gap-3">
            <button onClick={() => add(true)} disabled={busy !== null} className="h-14 flex-1 rounded-[var(--store-btn,999px)] bg-accent font-display text-base font-bold text-accent-fg shadow-[var(--store-btn-shadow,0_4px_0_var(--ink))] transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:bg-accent-hover active:translate-y-1 active:shadow-none disabled:opacity-60">
              {busy === "order" ? "…" : t(locale, "product.orderNow")}
            </button>
            <button onClick={() => add(false)} disabled={busy !== null} className="h-14 flex-1 rounded-[var(--store-btn,999px)] border-2 border-ink bg-surface font-display text-base font-bold transition-[transform,background-color] duration-150 hover:bg-canvas active:scale-[0.98] disabled:opacity-60">
              {busy === "cart" ? "…" : t(locale, "product.addToCart")}
            </button>
          </div>
        ) : (
          <Unavailable sold={sold} available={available} locale={locale} />
        )}
        {askButton(false)}
      </div>

      {/* Phones: sticky action bar in thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 shadow-bar backdrop-blur-md md:hidden">
        <div className="flex gap-2">
          {askButton(true)}
          {canBuy ? (
            <>
              <button onClick={() => add(false)} disabled={busy !== null} aria-label={t(locale, "product.addToCart")} className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--store-btn,999px)] border-2 border-ink bg-surface transition-transform active:scale-[0.97] disabled:opacity-60">
                <ShoppingBag size={20} strokeWidth={2.2} />
              </button>
              <button onClick={() => add(true)} disabled={busy !== null} className="h-14 flex-1 rounded-[var(--store-btn,999px)] bg-accent font-display text-base font-bold text-accent-fg shadow-[var(--store-btn-shadow,0_4px_0_var(--ink))] transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:bg-accent-hover active:translate-y-1 active:shadow-none disabled:opacity-60">
                {busy === "order" ? "…" : t(locale, "product.orderNow")}
              </button>
            </>
          ) : (
            <div className="flex-1"><Unavailable sold={sold} available={available} locale={locale} /></div>
          )}
        </div>
      </div>
    </>
  );
}

function Unavailable({ sold, available, locale }: { sold: boolean; available: boolean; locale: Locale }) {
  return (
    <p className="flex h-14 items-center justify-center rounded-[var(--store-btn,999px)] bg-sunken px-5 text-center font-display text-[15px] font-bold text-ink-soft">
      {sold ? t(locale, "product.sold") : !available ? t(locale, "product.soldOut") : t(locale, "product.askPriceHint")}
    </p>
  );
}
