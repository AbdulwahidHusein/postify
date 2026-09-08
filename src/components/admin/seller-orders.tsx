"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OrderRow = {
  id: string;
  status: "new" | "confirmed" | "fulfilled" | "cancelled";
  quantity: number;
  buyerName: string;
  buyerPhone: string;
  notes: string | null;
  unitPrice: string | null;
  currency: string;
  createdAt: string;
  conversationId: string | null;
  product: {
    id: string;
    title: string;
    slug: string;
    imageSrc: string | null;
  } | null;
};

const STATUSES = ["all", "new", "confirmed", "fulfilled", "cancelled"] as const;

export function SellerOrdersList({ shopSlug }: { shopSlug: string }) {
  const [status, setStatus] =
    useState<(typeof STATUSES)[number]>("all");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = status === "all" ? "" : `?status=${status}`;
    const res = await fetch(
      `/api/shops/${encodeURIComponent(shopSlug)}/orders${qs}`,
      { credentials: "include" },
    );
    const data = (await res.json()) as {
      orders?: OrderRow[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to load orders");
    setRows(data.orders ?? []);
  }, [shopSlug, status]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await load();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function setOrderStatus(
    id: string,
    next: OrderRow["status"],
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="inbox-app inbox-app--admin">
      <header className="inbox-topbar inbox-topbar--stack">
        <div className="inbox-topbar-row">
          <div className="inbox-topbar-main">
            <h1>Orders</h1>
          </div>
        </div>
        <div className="inbox-topbar-row">
          <div className="inbox-filters" role="tablist" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={
                  status === s ? "inbox-filter is-active" : "inbox-filter"
                }
                onClick={() => setStatus(s)}
              >
                {s === "all" ? "All" : s[0]!.toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="inbox-filter-note">
        Order requests from buyers — arrange payment offline, then update status.
      </p>

      {error ? <p className="inbox-error">{error}</p> : null}

      {loading ? (
        <div className="inbox-loading" aria-busy="true">
          <span className="inbox-skeleton" />
          <span className="inbox-skeleton" />
        </div>
      ) : rows.length === 0 ? (
        <section className="inbox-empty">
          <p>No orders yet</p>
          <span>
            When a buyer taps Request order on a product, it shows up here and
            on Telegram.
          </span>
        </section>
      ) : (
        <ul className="order-list">
          {rows.map((o) => {
            const price =
              o.unitPrice != null
                ? `${o.currency} ${Number(o.unitPrice).toLocaleString()}`
                : o.currency;
            return (
              <li key={o.id} className="order-card">
                <div className="order-card-main">
                  <span className="inbox-thumb" aria-hidden>
                    {o.product?.imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.product.imageSrc} alt="" />
                    ) : (
                      <span className="inbox-thumb-fallback">O</span>
                    )}
                  </span>
                  <div className="order-card-copy">
                    <strong>
                      {o.product?.title ?? "Product"} · ×{o.quantity}
                    </strong>
                    <span>
                      {o.buyerName} · {o.buyerPhone} · {price}
                    </span>
                    {o.notes ? <span className="order-notes">{o.notes}</span> : null}
                    <span className="order-meta">
                      <span className={`order-status is-${o.status}`}>
                        {o.status}
                      </span>
                      <time dateTime={o.createdAt}>
                        {new Date(o.createdAt).toLocaleString()}
                      </time>
                    </span>
                  </div>
                </div>
                <div className="order-card-actions">
                  {o.conversationId ? (
                    <Link
                      href={`/dashboard/s/${shopSlug}/inbox/${o.conversationId}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Chat
                    </Link>
                  ) : null}
                  {o.product ? (
                    <Link
                      href={`/p/${o.product.slug}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Product
                    </Link>
                  ) : null}
                  {o.status === "new" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === o.id}
                        onClick={() => void setOrderStatus(o.id, "confirmed")}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === o.id}
                        onClick={() => void setOrderStatus(o.id, "cancelled")}
                      >
                        Cancel
                      </button>
                    </>
                  ) : null}
                  {o.status === "confirmed" ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === o.id}
                      onClick={() => void setOrderStatus(o.id, "fulfilled")}
                    >
                      Fulfilled
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
