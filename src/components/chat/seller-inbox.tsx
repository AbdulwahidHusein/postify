"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ChatConversation } from "@/components/chat/chat-thread";
import { PageLoader } from "@/components/ui/loader";

function formatInboxTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type RoleMode = "selling" | "buying";
type ReadFilter = "all" | "unread";

export function SellerInboxList({ shopSlug }: { shopSlug: string }) {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const initialRole =
    searchParams.get("as") === "buyer" ? "buying" : "selling";
  const [role, setRole] = useState<RoleMode>(initialRole);
  const [filter, setFilter] = useState<ReadFilter>(
    searchParams.get("unread") === "1" ? "unread" : "all",
  );
  const [rows, setRows] = useState<ChatConversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (role === "buying") {
      const res = await fetch("/api/inbox", { credentials: "include" });
      const data = (await res.json()) as {
        conversations?: ChatConversation[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load inbox");
      const list = data.conversations ?? [];
      const filtered =
        filter === "unread" ? list.filter((c) => c.unread > 0) : list;
      setRows(filtered);
      setUnreadTotal(list.reduce((n, c) => n + (c.unread > 0 ? c.unread : 0), 0));
      return;
    }

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
  }, [shopSlug, filter, productId, role]);

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
    <div className="inbox-app inbox-app--admin">
      <header className="inbox-topbar inbox-topbar--stack">
        <div className="inbox-topbar-row">
          <div className="inbox-topbar-main">
            <h1>Inbox</h1>
            {unreadTotal > 0 ? (
              <span className="inbox-topbar-unread">{unreadTotal} unread</span>
            ) : null}
          </div>
          <div className="inbox-filters" role="tablist" aria-label="Role">
            <button
              type="button"
              role="tab"
              aria-selected={role === "selling"}
              className={
                role === "selling" ? "inbox-filter is-active" : "inbox-filter"
              }
              onClick={() => setRole("selling")}
            >
              Selling
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={role === "buying"}
              className={
                role === "buying" ? "inbox-filter is-active" : "inbox-filter"
              }
              onClick={() => setRole("buying")}
            >
              Buying
            </button>
          </div>
        </div>
        <div className="inbox-topbar-row">
          <div className="inbox-filters" role="tablist" aria-label="Filter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={
                filter === "all" ? "inbox-filter is-active" : "inbox-filter"
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
                filter === "unread" ? "inbox-filter is-active" : "inbox-filter"
              }
              onClick={() => setFilter("unread")}
            >
              Unread
            </button>
          </div>
        </div>
      </header>

      {role === "selling" && productId ? (
        <p className="inbox-filter-note">
          One product only.{" "}
          <Link href={`/dashboard/s/${shopSlug}/inbox`}>Show all</Link>
        </p>
      ) : null}

      {role === "buying" ? (
        <p className="inbox-filter-note">
          Chats where you messaged other shops as a buyer.
        </p>
      ) : null}

      {error ? <p className="inbox-error">{error}</p> : null}

      {loading ? (
        <PageLoader label="Loading inbox" className="inbox-page-loader" />
      ) : rows.length === 0 ? (
        <section className="inbox-empty">
          <p>
            {filter === "unread"
              ? "No unread messages"
              : role === "buying"
                ? "No buyer chats yet"
                : "No messages yet"}
          </p>
          {role === "buying" ? (
            <span>Message a seller from a product page.</span>
          ) : null}
        </section>
      ) : (
        <ul className="inbox-list">
          {rows.map((c) => {
            const href =
              role === "buying"
                ? `/inbox/${c.id}`
                : `/dashboard/s/${shopSlug}/inbox/${c.id}`;
            const title =
              role === "buying"
                ? (c.product?.title ?? "Product")
                : (c.buyer?.firstName ?? "Buyer");
            const previewLead =
              role === "buying"
                ? c.shop?.name
                  ? `${c.shop.name}: `
                  : ""
                : c.product?.title
                  ? `${c.product.title} · `
                  : "";
            const fallback = title.slice(0, 1);

            return (
              <li key={c.id}>
                <Link href={href} className="inbox-row">
                  <span className="inbox-thumb" aria-hidden>
                    {c.product?.imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.product.imageSrc} alt="" />
                    ) : (
                      <span className="inbox-thumb-fallback">{fallback}</span>
                    )}
                  </span>
                  <span className="inbox-body">
                    <span className="inbox-row-top">
                      <strong className="inbox-title">{title}</strong>
                      <time
                        className="inbox-time"
                        dateTime={c.lastMessageAt ?? undefined}
                      >
                        {formatInboxTime(c.lastMessageAt)}
                      </time>
                    </span>
                    <span className="inbox-row-bottom">
                      <span className="inbox-preview">
                        {previewLead}
                        {c.lastMessagePreview || "No messages yet"}
                      </span>
                      {c.unread > 0 ? (
                        <span className="inbox-badge">{c.unread}</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
