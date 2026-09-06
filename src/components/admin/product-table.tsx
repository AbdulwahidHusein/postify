"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import type { AdminProduct } from "@/components/admin/types";

function statusClass(status: AdminProduct["status"]) {
  return `admin-status admin-status-${status}`;
}

function formatMoney(product: AdminProduct) {
  if (product.price == null) return "—";
  return `${product.currency} ${product.price.toLocaleString()}`;
}

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
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [category, setCategory] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (appliedQ.trim()) params.set("q", appliedQ.trim());
    if (appliedCategory.trim()) params.set("category", appliedCategory.trim());
    if (status !== "all") params.set("status", status);
    const res = await fetch(
      `/api/shops/${encodeURIComponent(shopSlug)}/products?${params}`,
      { credentials: "include" },
    );
    const data = (await res.json()) as {
      products?: AdminProduct[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to load products");
    return data.products ?? [];
  }, [shopSlug, appliedQ, appliedCategory, status]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await load();
        if (cancelled) return;
        setProducts(rows);
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
  }, [load]);

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
      setProducts(await load());
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
      setProducts(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const editHref = (id: string) =>
    `/dashboard/s/${shopSlug}/products/${id}`;

  return (
    <div className="admin-stack">
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Catalog</p>
          <h1 className="admin-h1">Products</h1>
          <p className="admin-lead">
            Search, edit, publish, or archive listings.
          </p>
        </div>
        <Link
          href={`/dashboard/s/${shopSlug}/products/new`}
          className="btn btn-primary btn-sm"
        >
          Add product
        </Link>
      </header>

      <form
        className="admin-toolbar admin-toolbar-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
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
        <select
          className="field admin-select"
          value={status}
          onChange={(e) => {
            setLoading(true);
            setStatus(e.target.value);
          }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button type="submit" className="btn btn-ghost btn-sm">
          Search
        </button>
      </form>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading ? (
        <p className="admin-loading">Loading catalog…</p>
      ) : products.length === 0 ? (
        <section className="admin-empty">
          <h2>
            {status === "draft" ? "No drafts to review" : "No products yet"}
          </h2>
          <p>
            {status === "draft"
              ? "Channel imports below your auto-publish threshold will show up here."
              : channelConnected
                ? "Post a photo + caption with a price in your channel, or add a product manually."
                : "Connect a Telegram channel to sync posts, or add a product manually."}
          </p>
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
            ) : (
              <Link
                href={`/dashboard/s/${shopSlug}/channels`}
                className="btn btn-ghost btn-sm"
              >
                Channel status
              </Link>
            )}
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
                  const busy = busyId === product.id;
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
                        <div className="admin-row-actions">
                          <Link
                            href={editHref(product.id)}
                            className="btn btn-ghost btn-xs"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={busy}
                            onClick={() =>
                              setProductStatus(
                                product.id,
                                product.status === "published"
                                  ? "archived"
                                  : "published",
                              )
                            }
                          >
                            {product.status === "published"
                              ? "Archive"
                              : "Publish"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs is-danger"
                            disabled={busy}
                            onClick={() => onDelete(product.id)}
                          >
                            Delete
                          </button>
                        </div>
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
                        className="btn btn-ghost btn-xs"
                        disabled={busy}
                        onClick={() =>
                          setProductStatus(
                            product.id,
                            product.status === "published"
                              ? "archived"
                              : "published",
                          )
                        }
                      >
                        {product.status === "published" ? "Archive" : "Publish"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
