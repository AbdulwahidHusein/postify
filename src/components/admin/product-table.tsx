"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import type { AdminProduct } from "@/components/admin/types";
import { PaginationBar } from "@/components/pagination-bar";
import { InlineLoader } from "@/components/ui/loader";
import { ADMIN_PAGE_SIZE, type PageMeta } from "@/lib/pagination";

type StatusFilter = "all" | AdminProduct["status"];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "published", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "sold", label: "Sold" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

function statusClass(status: AdminProduct["status"]) {
  return `admin-status admin-status-${status}`;
}

function formatMoney(product: AdminProduct) {
  if (product.price == null) return "—";
  return `${product.currency} ${product.price.toLocaleString()}`;
}

function primaryAction(status: AdminProduct["status"]): {
  label: string;
  next: AdminProduct["status"];
  primary?: boolean;
} {
  switch (status) {
    case "published":
      return { label: "Mark sold", next: "sold", primary: true };
    case "sold":
      return { label: "Relist", next: "published", primary: true };
    case "draft":
      return { label: "Publish", next: "published", primary: true };
    case "archived":
      return { label: "Restore", next: "published" };
  }
}

function secondaryAction(
  status: AdminProduct["status"],
): { label: string; next: AdminProduct["status"] } | null {
  if (status === "published" || status === "sold" || status === "draft") {
    return { label: "Archive", next: "archived" };
  }
  return null;
}

function emptyCopy(status: StatusFilter, channelConnected: boolean) {
  if (status === "sold") {
    return {
      title: "No sold items yet",
      body: "When an item sells, mark it sold here. It leaves the public shop but stays in this view.",
    };
  }
  if (status === "draft") {
    return {
      title: "No drafts to review",
      body: "Channel imports below your auto-publish threshold will show up here.",
    };
  }
  if (status === "archived") {
    return {
      title: "Nothing archived",
      body: "Archived listings are hidden from buyers. Restore anytime.",
    };
  }
  if (status === "published") {
    return {
      title: "No live products",
      body: channelConnected
        ? "Post a photo + caption with a price in your channel, or add a product manually."
        : "Connect a Telegram channel to sync posts, or add a product manually.",
    };
  }
  return {
    title: "No products yet",
    body: channelConnected
      ? "Post a photo + caption with a price in your channel, or add a product manually."
      : "Connect a Telegram channel to sync posts, or add a product manually.",
  };
}

const emptyMeta: PageMeta = {
  page: 1,
  pageSize: ADMIN_PAGE_SIZE,
  total: 0,
  pageCount: 0,
  hasNext: false,
  hasPrev: false,
};

export function ProductTable({
  shopSlug,
  initialStatus = "all",
  channelConnected = false,
}: {
  shopSlug: string;
  initialStatus?: string;
  channelConnected?: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [pagination, setPagination] = useState<PageMeta>(emptyMeta);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [category, setCategory] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_TABS.some((t) => t.value === initialStatus)
      ? (initialStatus as StatusFilter)
      : "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(ADMIN_PAGE_SIZE));
      if (appliedQ.trim()) params.set("q", appliedQ.trim());
      if (appliedCategory.trim()) params.set("category", appliedCategory.trim());
      if (status !== "all") params.set("status", status);
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopSlug)}/products?${params}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        products?: AdminProduct[];
        pagination?: PageMeta;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load products");
      return {
        products: data.products ?? [],
        pagination: data.pagination ?? emptyMeta,
      };
    },
    [shopSlug, appliedQ, appliedCategory, status],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await load(page);
        if (cancelled) return;
        setProducts(result.products);
        setPagination(result.pagination);
        if (result.pagination.page !== page) {
          setPage(result.pagination.page);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, page]);

  function selectStatus(next: StatusFilter) {
    setLoading(true);
    setPage(1);
    setStatus(next);
    const params = new URLSearchParams();
    if (next !== "all") params.set("status", next);
    const qs = params.toString();
    router.replace(
      `/dashboard/s/${shopSlug}/products${qs ? `?${qs}` : ""}`,
      { scroll: false },
    );
  }

  async function reload(preferredPage = page) {
    const result = await load(preferredPage);
    setProducts(result.products);
    setPagination(result.pagination);
    setPage(result.pagination.page);
  }

  async function setProductStatus(id: string, next: AdminProduct["status"]) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Permanently delete this product?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const editHref = (id: string) =>
    `/dashboard/s/${shopSlug}/products/${id}`;

  const empty = emptyCopy(status, channelConnected);

  function RowActions({ product }: { product: AdminProduct }) {
    const busy = busyId === product.id;
    const primary = primaryAction(product.status);
    const secondary = secondaryAction(product.status);
    return (
      <div className="admin-row-actions">
        <Link href={editHref(product.id)} className="btn btn-ghost btn-xs">
          Edit
        </Link>
        <button
          type="button"
          className={
            primary.primary ? "btn btn-primary btn-xs" : "btn btn-ghost btn-xs"
          }
          disabled={busy}
          onClick={() => setProductStatus(product.id, primary.next)}
        >
          {primary.label}
        </button>
        {secondary ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() => setProductStatus(product.id, secondary.next)}
          >
            {secondary.label}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-xs is-danger"
          disabled={busy}
          onClick={() => onDelete(product.id)}
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="admin-stack">
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Catalog</p>
          <h1 className="admin-h1">Products</h1>
          <p className="admin-lead">
            Publish, mark sold, or archive — one place for every listing.
          </p>
        </div>
        <Link
          href={`/dashboard/s/${shopSlug}/products/new`}
          className="btn btn-primary btn-sm"
        >
          Add product
        </Link>
      </header>

      <div className="admin-status-tabs" role="tablist" aria-label="Status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={
              status === tab.value
                ? "admin-status-tab is-active"
                : "admin-status-tab"
            }
            onClick={() => selectStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        className="admin-toolbar admin-toolbar-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          setPage(1);
          setAppliedQ(q);
          setAppliedCategory(category);
        }}
      >
        <input
          className="field admin-search"
          placeholder="Search title, tags, SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="admin-toolbar-category">
          <CategoryCombobox value={category} onChange={setCategory} />
        </div>
        <button type="submit" className="btn btn-ghost btn-sm">
          Search
        </button>
      </form>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading ? (
        <InlineLoader label="Loading catalog" />
      ) : products.length === 0 ? (
        <section className="admin-empty">
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
          <div className="admin-actions">
            <Link
              href={`/dashboard/s/${shopSlug}/products/new`}
              className="btn btn-primary btn-sm"
            >
              Add product
            </Link>
            {!channelConnected ? (
              <Link
                href={`/dashboard/s/${shopSlug}/channels`}
                className="btn btn-ghost btn-sm"
              >
                Connect channel
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="admin-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const image = product.images[0];
                  return (
                    <tr key={product.id}>
                      <td>
                        <button
                          type="button"
                          className="admin-product-cell"
                          onClick={() => router.push(editHref(product.id))}
                        >
                          <span className="admin-thumb">
                            {image?.src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={image.src} alt="" />
                            ) : null}
                          </span>
                          <span>
                            <strong>{product.title}</strong>
                            {product.category ? (
                              <span className="admin-meta">
                                {product.category}
                              </span>
                            ) : null}
                            {product.status === "draft" &&
                            product.confidence != null ? (
                              <span className="admin-meta">
                                {(product.confidence * 100).toFixed(0)}%
                                confidence
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td className="admin-mono">{formatMoney(product)}</td>
                      <td>
                        <span className={statusClass(product.status)}>
                          {product.status}
                        </span>
                      </td>
                      <td className="admin-muted">
                        {new Date(product.updatedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <RowActions product={product} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {products.map((product) => {
              const image = product.images[0];
              const primary = primaryAction(product.status);
              const busy = busyId === product.id;
              return (
                <article key={product.id} className="admin-product-card">
                  <button
                    type="button"
                    className="admin-product-cell"
                    onClick={() => router.push(editHref(product.id))}
                  >
                    <span className="admin-thumb admin-thumb-lg">
                      {image?.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.src} alt="" />
                      ) : null}
                    </span>
                    <span>
                      <strong>{product.title}</strong>
                      <span className="admin-meta">
                        {formatMoney(product)}
                      </span>
                    </span>
                  </button>
                  <div className="admin-product-card-foot">
                    <span className={statusClass(product.status)}>
                      {product.status}
                    </span>
                    <div className="admin-row-actions">
                      <Link
                        href={editHref(product.id)}
                        className="btn btn-ghost btn-xs"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className={
                          primary.primary
                            ? "btn btn-primary btn-xs"
                            : "btn btn-ghost btn-xs"
                        }
                        disabled={busy}
                        onClick={() =>
                          setProductStatus(product.id, primary.next)
                        }
                      >
                        {primary.label}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <PaginationBar
            meta={pagination}
            onPageChange={(next) => {
              setLoading(true);
              setPage(next);
            }}
          />
        </>
      )}
    </div>
  );
}
