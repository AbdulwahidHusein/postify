"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { backButton } from "@tma.js/sdk";
import { ChevronLeft, Pencil, SlidersHorizontal } from "lucide-react";
import { useTelegram } from "@/lib/telegram/context";
import { Button } from "@/components/ui/button";
import type { ShopViewer } from "@/lib/viewer";

type Props = {
  shopSlug?: string;
  shopName?: string;
  backHref?: string;
  backLabel?: string;
  viewer: ShopViewer;
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
  ownerPrimaryLabel = "Edit",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isTma, ready } = useTelegram();

  const shopPath = shopSlug ? `/s/${shopSlug}` : null;
  const onShopHome = Boolean(shopPath && pathname === shopPath);
  const resolvedBack = backHref ?? (shopPath && !onShopHome ? shopPath : null);

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

  const isOwner = viewer.kind === "owner";

  let right: ReactNode = null;
  if (isOwner) {
    right = (
      <Button asChild variant="secondary" size="sm">
        <Link
          href={ownerPrimaryHref ?? `/dashboard/s/${viewer.shopSlug}`}
        >
          {ownerPrimaryHref ? (
            <>
              <Pencil className="h-4 w-4" aria-hidden />
              {ownerPrimaryLabel}
            </>
          ) : (
            <>
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Dashboard
            </>
          )}
        </Link>
      </Button>
    );
  } else if (viewer.kind === "signed_in" && viewer.hasAnyShop) {
    right = (
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard">Dashboard</Link>
      </Button>
    );
  }

  return (
    <nav className="storefront-nav" aria-label="Shop">
      <div className="storefront-nav-left">
        {resolvedBack ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={resolvedBack}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {backLabel}
            </Link>
          </Button>
        ) : null}
        {shopName && shopPath && !onShopHome ? (
          <Link href={shopPath} className="storefront-nav-shop">
            {shopName}
          </Link>
        ) : null}
      </div>
      {right ? <div className="storefront-nav-right">{right}</div> : null}
    </nav>
  );
}
