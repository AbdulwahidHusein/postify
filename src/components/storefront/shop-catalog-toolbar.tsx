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
  categories: string[];
  resultCount: number;
  filtered: boolean;
};

export function shopCatalogHref(
  shopSlug: string,
  opts: {
    q?: string;
    category?: string;
    sort?: ShopSort;
    page?: number;
  },
) {
  const params = new URLSearchParams();
  const q = opts.q?.trim();
  const category = opts.category?.trim();
  const sort = opts.sort && opts.sort !== "newest" ? opts.sort : undefined;
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/s/${shopSlug}?${qs}` : `/s/${shopSlug}`;
}

export function ShopCatalogToolbar({
  shopSlug,
  q: initialQ,
  category: initialCategory,
  sort: initialSort,
  categories,
  resultCount,
  filtered,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState<ShopSort>(initialSort);
  const [filtersOpen, setFiltersOpen] = useState(filtered);

  useEffect(() => {
    setQ(initialQ);
    setCategory(initialCategory);
    setSort(initialSort);
    if (filtered) setFiltersOpen(true);
  }, [initialQ, initialCategory, initialSort, filtered]);

  function applyFilters(next?: {
    q?: string;
    category?: string;
    sort?: ShopSort;
  }) {
    router.push(
      shopCatalogHref(shopSlug, {
        q: next?.q ?? q,
        category: next?.category ?? category,
        sort: next?.sort ?? sort,
      }),
    );
  }

  return (
    <div className="shop-toolbar">
      <form
        className="shop-toolbar-bar"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        <input
          className="field shop-search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          autoComplete="off"
          aria-label="Search products"
        />

        <button
          type="button"
          className={
            filtersOpen || filtered
              ? "btn btn-ghost btn-sm shop-filters-toggle is-active"
              : "btn btn-ghost btn-sm shop-filters-toggle"
          }
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters
          {filtered ? <span className="shop-filter-dot" aria-hidden /> : null}
        </button>

        <div
          className={
            filtersOpen
              ? "shop-toolbar-advanced is-open"
              : "shop-toolbar-advanced"
          }
        >
          <div className="shop-toolbar-category">
            <CategoryCombobox
              key={initialCategory || "__all__"}
              value={category}
              onChange={setCategory}
            />
          </div>

          <select
            className="field shop-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value as ShopSort;
              setSort(next);
              applyFilters({ sort: next });
            }}
            aria-label="Sort products"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-sm">
          Search
        </button>
        {filtered ? (
          <Link href={`/s/${shopSlug}`} className="btn btn-ghost btn-sm">
            Clear
          </Link>
        ) : null}
      </form>

      {categories.length > 0 && filtersOpen ? (
        <div className="shop-filters" role="list" aria-label="Quick categories">
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

      <p className="shop-result-meta">
        {resultCount} {resultCount === 1 ? "product" : "products"}
        {category ? (
          <>
            {" "}
            · <strong>{category}</strong>
          </>
        ) : null}
        {initialQ ? (
          <>
            {" "}
            · “{initialQ}”
          </>
        ) : null}
      </p>
    </div>
  );
}
