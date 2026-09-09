"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ShopSort = "newest" | "price_asc" | "price_desc";

type Props = {
  shopSlug: string;
  q: string;
  category: string;
  sort: ShopSort;
  minPrice: string;
  maxPrice: string;
  categories: string[];
  resultCount: number;
  filtered: boolean;
  priceBounds?: { min: number | null; max: number | null };
  currency?: string;
};

export function shopCatalogHref(
  shopSlug: string,
  opts: {
    q?: string;
    category?: string;
    sort?: ShopSort;
    minPrice?: string;
    maxPrice?: string;
    page?: number;
  },
) {
  const params = new URLSearchParams();
  const q = opts.q?.trim();
  const category = opts.category?.trim();
  const sort = opts.sort && opts.sort !== "newest" ? opts.sort : undefined;
  const minPrice = opts.minPrice?.trim();
  const maxPrice = opts.maxPrice?.trim();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);
  if (minPrice) params.set("minPrice", minPrice);
  if (maxPrice) params.set("maxPrice", maxPrice);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/s/${shopSlug}?${qs}` : `/s/${shopSlug}`;
}

export function ShopCatalogToolbar({
  shopSlug,
  q: initialQ,
  category: initialCategory,
  sort: initialSort,
  minPrice: initialMin,
  maxPrice: initialMax,
  categories,
  resultCount,
  filtered,
  priceBounds,
  currency = "ETB",
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState<ShopSort>(initialSort);
  const [minPrice, setMinPrice] = useState(initialMin);
  const [maxPrice, setMaxPrice] = useState(initialMax);
  const [priceOpen, setPriceOpen] = useState(
    Boolean(initialMin || initialMax),
  );

  useEffect(() => {
    setQ(initialQ);
    setSort(initialSort);
    setMinPrice(initialMin);
    setMaxPrice(initialMax);
    if (initialMin || initialMax) setPriceOpen(true);
  }, [initialQ, initialSort, initialMin, initialMax]);

  function apply(next?: {
    q?: string;
    category?: string;
    sort?: ShopSort;
    minPrice?: string;
    maxPrice?: string;
  }) {
    router.push(
      shopCatalogHref(shopSlug, {
        q: next?.q ?? q,
        category: next?.category ?? initialCategory,
        sort: next?.sort ?? sort,
        minPrice: next?.minPrice ?? minPrice,
        maxPrice: next?.maxPrice ?? maxPrice,
      }),
    );
  }

  const priceActive = Boolean(initialMin || initialMax);
  const minPlaceholder =
    priceBounds?.min != null
      ? String(Math.floor(priceBounds.min))
      : "Min";
  const maxPlaceholder =
    priceBounds?.max != null
      ? String(Math.ceil(priceBounds.max))
      : "Max";

  return (
    <div className="shop-toolbar">
      {categories.length > 0 ? (
        <div className="shop-collections" role="list" aria-label="Collections">
          <button
            type="button"
            className={
              initialCategory ? "shop-collection" : "shop-collection is-active"
            }
            onClick={() => apply({ category: "" })}
          >
            All
          </button>
          {categories.map((cat) => {
            const active =
              initialCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                type="button"
                className={
                  active ? "shop-collection is-active" : "shop-collection"
                }
                onClick={() =>
                  apply({ category: active ? "" : cat })
                }
              >
                {cat}
              </button>
            );
          })}
        </div>
      ) : null}

      <form
        className="shop-toolbar-bar"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="shop-search-field">
          <span className="shop-search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M16.5 16.5L20 20"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            className="shop-search-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            autoComplete="off"
            aria-label="Search products"
          />
        </div>

        <select
          className="shop-sort"
          value={sort}
          onChange={(e) => {
            const next = e.target.value as ShopSort;
            setSort(next);
            apply({ sort: next });
          }}
          aria-label="Sort products"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
        </select>

        <button
          type="button"
          className={
            priceOpen || priceActive
              ? "shop-toolbar-chip is-active"
              : "shop-toolbar-chip"
          }
          aria-expanded={priceOpen}
          onClick={() => setPriceOpen((open) => !open)}
        >
          Price
          {priceActive ? (
            <span className="shop-filter-dot" aria-hidden />
          ) : null}
        </button>
      </form>

      {priceOpen ? (
        <div className="shop-price-panel">
          <div className="shop-price-inputs">
            <input
              className="shop-price-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder={minPlaceholder}
              aria-label={`Minimum price (${currency})`}
            />
            <span className="shop-price-sep" aria-hidden>
              –
            </span>
            <input
              className="shop-price-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder={maxPlaceholder}
              aria-label={`Maximum price (${currency})`}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => apply()}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      <div className="shop-result-row">
        <p className="shop-result-meta">
          {resultCount} {resultCount === 1 ? "product" : "products"}
          {initialCategory ? <> · {initialCategory}</> : null}
          {initialQ ? <> · “{initialQ}”</> : null}
        </p>
        {filtered ? (
          <Link href={`/s/${shopSlug}`} className="shop-clear">
            Clear
          </Link>
        ) : null}
      </div>
    </div>
  );
}
