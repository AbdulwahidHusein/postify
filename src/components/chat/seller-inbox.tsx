"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ChatConversation } from "@/components/chat/chat-thread";

export function SellerInboxList({ shopSlug }: { shopSlug: string }) {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const [filter, setFilter] = useState<"all" | "unread">(
    searchParams.get("unread") === "1" ? "unread" : "all",
  );
  const [rows, setRows] = useState<ChatConversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === "unread") params.set("unread", "1");
    if (productId) params.set("productId", productId);
    const res = await fetch(
      `/api/shops/${encodeURIComponent(shopSlug)}/inbox?${params}`,
      { credentials: "include" },
    );
    const data = (await res.json()) as {
      conversations?: ChatConversation[];
      unreadTotal?: number;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to load inbox");
    setRows(data.conversations ?? []);
    setUnreadTotal(data.unreadTotal ?? 0);
  }, [shopSlug, filter, productId]);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load().catch(() => {});
    }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="chat-inbox admin-stack">
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Messages</p>
          <h1 className="admin-h1">Inbox</h1>
          <p className="admin-lead">
            Product inquiries from buyers. Reply here or in Telegram.
            {unreadTotal > 0 ? ` · ${unreadTotal} unread` : ""}
          </p>
        </div>
      </header>

      <div className="admin-status-tabs" role="tablist" aria-label="Filter">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={
            filter === "all" ? "admin-status-tab is-active" : "admin-status-tab"
          }
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "unread"}
          className={
            filter === "unread"
              ? "admin-status-tab is-active"
              : "admin-status-tab"
          }
          onClick={() => setFilter("unread")}
        >
          Unread
        </button>
      </div>

      {productId ? (
        <p className="admin-muted">
          Filtered to one product.{" "}
          <Link href={`/dashboard/s/${shopSlug}/inbox`}>Show all</Link>
        </p>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {loading ? (
        <p className="admin-loading">Loading inbox…</p>
      ) : rows.length === 0 ? (
        <section className="admin-empty">
          <h2>{filter === "unread" ? "No unread messages" : "No messages yet"}</h2>
          <p>
            When buyers tap Message seller on a product, conversations show up
            here — and you get a Telegram alert.
          </p>
        </section>
      ) : (
        <ul className="chat-inbox-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/s/${shopSlug}/inbox/${c.id}`}
                className="chat-inbox-row"
              >
                <span className="chat-product-thumb" aria-hidden>
                  {c.product?.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.product.imageSrc} alt="" />
                  ) : null}
                </span>
                <span className="chat-inbox-copy">
                  <strong>{c.product?.title ?? "Product"}</strong>
                  <span className="chat-inbox-meta">
                    {c.buyer?.firstName ?? "Buyer"}
                    {c.lastMessagePreview ? ` · ${c.lastMessagePreview}` : ""}
                  </span>
                </span>
                {c.unread > 0 ? (
                  <span className="chat-unread">{c.unread}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
