"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { backButton } from "@tma.js/sdk";
import { useTelegram } from "@/lib/telegram/context";
import type { ShopViewer } from "@/lib/viewer";

type Props = {
  shopSlug?: string;
  shopName?: string;
  backHref?: string;
  backLabel?: string;
  viewer: ShopViewer;
  /** Optional deep link when viewer owns this shop (e.g. edit product). */
  ownerPrimaryHref?: string;
  ownerPrimaryLabel?: string;
};

export function StorefrontNav({
  shopSlug,
  shopName,
  backHref,
  backLabel = "Back",
  viewer,
  ownerPrimaryHref,
  ownerPrimaryLabel = "Manage",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isTma, ready } = useTelegram();

  const shopPath = shopSlug ? `/s/${shopSlug}` : null;
  const canGoShop = Boolean(shopPath && pathname !== shopPath);
  const resolvedBack = backHref ?? (canGoShop ? shopPath! : null);
  const isOwner = viewer.kind === "owner";

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
      router.push(shopPath || "/");
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
    <nav
      className={isOwner ? "storefront-nav is-owner" : "storefront-nav is-buyer"}
      aria-label="Shop"
    >
      <div className="storefront-nav-left">
        {resolvedBack ? (
          <Link href={resolvedBack} className="storefront-nav-back">
            ← {backLabel}
          </Link>
        ) : (
          <Link href="/" className="storefront-nav-back">
            ← Home
          </Link>
        )}
        {/* Shop name only when not already on the shop page (title lives in the body). */}
        {shopName && shopPath && canGoShop ? (
          <Link href={shopPath} className="storefront-nav-shop">
            {shopName}
          </Link>
        ) : null}
        {isOwner ? (
          <span className="storefront-nav-badge">Your shop</span>
        ) : null}
      </div>

      <div className="storefront-nav-right">
        {shopPath && canGoShop && !isOwner ? (
          <Link href={shopPath} className="storefront-nav-all">
            All products
          </Link>
        ) : null}

        {/* One owner action in the chrome — page body owns any extra (e.g. Add product). */}
        {isOwner ? (
          <Link
            href={
              ownerPrimaryHref ?? `/dashboard/s/${viewer.shopSlug}`
            }
            className="btn btn-primary btn-sm"
          >
            {ownerPrimaryHref ? ownerPrimaryLabel : "Dashboard"}
          </Link>
        ) : null}

        {viewer.kind === "signed_in" && viewer.hasAnyShop ? (
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            My shops
          </Link>
        ) : null}

        {viewer.kind === "signed_in" && !viewer.hasAnyShop ? (
          <Link href="/dashboard" className="btn btn-primary btn-sm">
            Create your store
          </Link>
        ) : null}

        {viewer.kind === "guest" ? (
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Sell on Postify
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
