"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CategoryCombobox } from "@/components/admin/category-combobox";

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
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState<ShopSort>(initialSort);
  const [minPrice, setMinPrice] = useState(initialMin);
  const [maxPrice, setMaxPrice] = useState(initialMax);
  const [filtersOpen, setFiltersOpen] = useState(filtered);

  useEffect(() => {
    setQ(initialQ);
    setCategory(initialCategory);
    setSort(initialSort);
    setMinPrice(initialMin);
    setMaxPrice(initialMax);
    if (filtered) setFiltersOpen(true);
  }, [
    initialQ,
    initialCategory,
    initialSort,
    initialMin,
    initialMax,
    filtered,
  ]);

  function applyFilters(next?: {
    q?: string;
    category?: string;
    sort?: ShopSort;
    minPrice?: string;
    maxPrice?: string;
  }) {
    router.push(
      shopCatalogHref(shopSlug, {
        q: next?.q ?? q,
        category: next?.category ?? category,
        sort: next?.sort ?? sort,
        minPrice: next?.minPrice ?? minPrice,
        maxPrice: next?.maxPrice ?? maxPrice,
      }),
    );
  }

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
      <form
        className="shop-toolbar-search"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
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
            placeholder="Search products…"
            autoComplete="off"
            aria-label="Search products"
          />
        </div>

        <button
          type="button"
          className={
            filtersOpen || filtered
              ? "shop-toolbar-chip is-active"
              : "shop-toolbar-chip"
          }
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters
          {filtered ? <span className="shop-filter-dot" aria-hidden /> : null}
        </button>

        <select
          className="shop-sort shop-toolbar-chip-select"
          value={sort}
          onChange={(e) => {
            const next = e.target.value as ShopSort;
            setSort(next);
            applyFilters({ sort: next });
          }}
          aria-label="Sort products"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
        </select>

        <button type="submit" className="shop-search-submit">
          Search
        </button>
      </form>

      {filtersOpen ? (
        <div className="shop-toolbar-panel">
          <div className="shop-toolbar-panel-grid">
            <div className="shop-toolbar-category">
              <label className="shop-field-label" htmlFor="shop-category">
                Category
              </label>
              <CategoryCombobox
                key={initialCategory || "__all__"}
                value={category}
                onChange={setCategory}
              />
            </div>

            <div className="shop-price-range">
              <span className="shop-field-label">Price ({currency})</span>
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
                  aria-label="Minimum price"
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
                  aria-label="Maximum price"
                />
              </div>
            </div>
          </div>

          <div className="shop-toolbar-panel-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => applyFilters()}
            >
              Apply filters
            </button>
            {filtered ? (
              <Link href={`/s/${shopSlug}`} className="btn btn-ghost btn-sm">
                Clear all
              </Link>
            ) : null}
          </div>

          {categories.length > 0 ? (
            <div
              className="shop-filters"
              role="list"
              aria-label="Quick categories"
            >
              <button
                type="button"
                className={category ? "shop-filter" : "shop-filter is-active"}
                onClick={() => {
                  setCategory("");
                  applyFilters({ category: "" });
                }}
              >
                All
              </button>
              {categories.map((cat) => {
                const active = category.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    className={active ? "shop-filter is-active" : "shop-filter"}
                    onClick={() => {
                      const next = active ? "" : cat;
                      setCategory(next);
                      applyFilters({ category: next });
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="shop-result-meta">
        {resultCount} {resultCount === 1 ? "product" : "products"}
        {category ? (
          <>
            {" "}
            · <strong>{category}</strong>
          </>
        ) : null}
        {initialQ ? <> · “{initialQ}”</> : null}
        {initialMin || initialMax ? (
          <>
            {" "}
            · {currency} {initialMin || "0"}–{initialMax || "∞"}
          </>
        ) : null}
      </p>
    </div>
  );
}
