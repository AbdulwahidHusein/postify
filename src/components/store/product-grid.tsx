"use client";

import { useState } from "react";
import { ProductCard } from "@/components/store/product-card";
import { t, type Locale } from "@/i18n";

type P = Parameters<typeof ProductCard>[0]["p"] & { id: string };

export function ProductGrid({ shop, base, locale, initial, cursor, query }: { shop: string; base: string; locale: Locale; initial: P[]; cursor: string | null; query: { q?: string; category?: string } }) {
  const [items, setItems] = useState(initial);
  const [next, setNext] = useState(cursor);
  const [loading, setLoading] = useState(false);
  async function more() {
    if (!next) return;
    setLoading(true);
    const qs = new URLSearchParams({ cursor: next, ...(query.q ? { q: query.q } : {}), ...(query.category ? { category: query.category } : {}) });
    try {
      const d = (await (await fetch(`/api/storefront/${shop}/products?${qs}`)).json()) as { items: P[]; nextCursor: string | null };
      setItems((xs) => [...xs, ...d.items]);
      setNext(d.nextCursor);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {items.map((p, i) => <ProductCard key={p.id} p={p} base={base} locale={locale} priority={i < 4} />)}
      </div>
      {next ? (
        <div className="mt-8 text-center">
          <button onClick={more} disabled={loading} className="h-11 rounded-full border border-line-strong bg-surface px-6 text-sm font-semibold hover:bg-sunken disabled:opacity-50">
            {loading ? "…" : t(locale, "shop.loadMore")}
          </button>
        </div>
      ) : null}
    </>
  );
}
