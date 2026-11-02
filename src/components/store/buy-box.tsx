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
        "flex h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-surface font-semibold text-ink transition-colors hover:bg-sunken disabled:opacity-60",
        compact ? "w-12" : "w-full",
      )}
    >
      <MessageCircle size={19} />
      {compact ? null : busy === "ask" ? "…" : t(locale, "product.askSeller")}
    </button>
  );

  return (
    <>
      {stock !== null && stock > 0 && stock <= 3 && canBuy ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-adey-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-adey" /> {t(locale, "product.inStock", { n: stock })}
        </p>
      ) : null}

      {/* Desktop: inline */}
      <div className="mt-5 hidden space-y-2.5 md:block">
        {canBuy ? (
          <div className="flex gap-2.5">
            <button onClick={() => add(true)} disabled={busy !== null} className="h-12 flex-1 rounded-[14px] bg-accent text-[15px] font-bold text-accent-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] transition-colors hover:bg-accent-hover disabled:opacity-60">
              {busy === "order" ? "…" : t(locale, "product.orderNow")}
            </button>
            <button onClick={() => add(false)} disabled={busy !== null} className="h-12 flex-1 rounded-[14px] border border-line-strong bg-surface text-[15px] font-semibold transition-colors hover:bg-sunken disabled:opacity-60">
              {busy === "cart" ? "…" : t(locale, "product.addToCart")}
            </button>
          </div>
        ) : (
          <Unavailable sold={sold} available={available} locale={locale} />
        )}
        {askButton(false)}
      </div>

      {/* Phones: sticky action bar in thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-bar backdrop-blur-md md:hidden">
        <div className="flex gap-2">
          {askButton(true)}
          {canBuy ? (
            <>
              <button onClick={() => add(false)} disabled={busy !== null} aria-label={t(locale, "product.addToCart")} className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-line-strong bg-surface disabled:opacity-60">
                <ShoppingBag size={19} />
              </button>
              <button onClick={() => add(true)} disabled={busy !== null} className="h-12 flex-1 rounded-[14px] bg-accent text-[15px] font-bold text-accent-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] disabled:opacity-60">
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
    <p className="flex h-12 items-center justify-center rounded-[14px] bg-sunken px-4 text-center text-sm font-semibold text-ink-soft">
      {sold ? t(locale, "product.sold") : !available ? t(locale, "product.soldOut") : t(locale, "product.askPriceHint")}
    </p>
  );
}
