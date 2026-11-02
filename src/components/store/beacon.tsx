"use client";

import { useEffect } from "react";

/** Count a view client-side (pages are CDN-cached, so the server can't). */
export function ViewBeacon({ shop, type, productId, sourceCode }: { shop: string; type: "product_viewed" | "shop_viewed"; productId?: string; sourceCode?: string | null }) {
  useEffect(() => {
    const key = `goods:v:${type}:${productId ?? shop}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    void fetch(`/api/storefront/${shop}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ type, productId: productId ?? null, sourceCode: sourceCode ?? null }),
    }).catch(() => undefined);
  }, [shop, type, productId, sourceCode]);
  return null;
}
