"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { backButton } from "@tma.js/sdk";
import { useTelegram } from "@/lib/telegram/context";
import { useAuth } from "@/components/providers/auth-provider";

type Props = {
  shopSlug?: string;
  shopName?: string;
  /** When on a product, back goes to the shop. */
  backHref?: string;
  backLabel?: string;
};

/**
 * Visible navigation for storefront pages (esp. Telegram WebView / Mini App,
 * where the marketing header is hidden and history can feel locked).
 */
export function StorefrontNav({
  shopSlug,
  shopName,
  backHref,
  backLabel = "Back",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isTma, ready } = useTelegram();
  const { user } = useAuth();

  const shopPath = shopSlug ? `/s/${shopSlug}` : null;
  const canGoShop = Boolean(shopPath && pathname !== shopPath);
  const resolvedBack = backHref ?? (canGoShop ? shopPath! : null);

  useEffect(() => {
    if (!ready || !isTma) return;

    try {
      backButton.mount.ifAvailable();
      backButton.show.ifAvailable();
    } catch {
      return;
    }

    if (!backButton.onClick.isAvailable()) return;

    const off = backButton.onClick(() => {
      if (resolvedBack) {
        router.push(resolvedBack);
        return;
      }
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
      router.push(shopPath || "/dashboard");
    });

    return () => {
      try {
        off();
        backButton.hide.ifAvailable();
      } catch {
        // ignore
      }
    };
  }, [ready, isTma, resolvedBack, shopPath, router]);

  return (
    <nav className="storefront-nav" aria-label="Shop">
      <div className="storefront-nav-left">
        {resolvedBack ? (
          <Link href={resolvedBack} className="storefront-nav-back">
            ← {backLabel}
          </Link>
        ) : user ? (
          <Link href="/dashboard" className="storefront-nav-back">
            ← Dashboard
          </Link>
        ) : (
          <Link href="/" className="storefront-nav-back">
            ← Home
          </Link>
        )}
        {shopName && shopPath ? (
          <Link href={shopPath} className="storefront-nav-shop">
            {shopName}
          </Link>
        ) : null}
      </div>
      <div className="storefront-nav-right">
        {canGoShop && shopPath ? (
          <Link href={shopPath} className="btn btn-ghost btn-sm">
            View shop
          </Link>
        ) : null}
        {user ? (
          <Link
            href={shopSlug ? `/dashboard/s/${shopSlug}` : "/dashboard"}
            className="btn btn-primary btn-sm"
          >
            Manage
          </Link>
        ) : (
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Seller login
          </Link>
        )}
      </div>
    </nav>
  );
}
