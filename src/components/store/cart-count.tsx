"use client";

import { useEffect, useState } from "react";

export const CART_EVENT = "goods:cart";

/** Badge that reads the cart once and listens for local updates. */
export function CartCount({ shop }: { shop: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/storefront/${shop}/cart`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { count?: number }) => alive && setN(d.count ?? 0))
      .catch(() => undefined);
    const on = (e: Event) => setN((e as CustomEvent<number>).detail);
    window.addEventListener(CART_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(CART_EVENT, on);
    };
  }, [shop]);
  return n ? <span className="num absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg ring-2 ring-surface">{n}</span> : null;
}
