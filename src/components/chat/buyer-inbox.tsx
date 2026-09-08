"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChatConversation } from "@/components/chat/chat-thread";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";

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

export function BuyerInboxList() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/inbox", { credentials: "include" });
        const data = (await res.json()) as {
          conversations?: ChatConversation[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setRows(data.conversations ?? []);
          setError(null);
        }
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
  }, [user]);

  if (authLoading || (loading && user)) {
    return (
      <div className="inbox-app">
        <header className="inbox-topbar">
          <h1>Inbox</h1>
        </header>
        <div className="inbox-loading" aria-busy="true">
          <span className="inbox-skeleton" />
          <span className="inbox-skeleton" />
          <span className="inbox-skeleton" />
        </div>
      </div>
    );
  }

  if (!user) {
    const botLink = telegramBotUsername
      ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=auth_inbox`
      : "/inbox";
    return (
      <div className="inbox-app">
        <header className="inbox-topbar">
          <h1>Inbox</h1>
        </header>
        <section className="inbox-gate">
          <p>Sign in with Telegram to message sellers.</p>
          <a href={botLink} className="btn btn-primary">
            Sign in
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="inbox-app">
      <header className="inbox-topbar">
        <h1>Inbox</h1>
        <Link href="/" className="inbox-topbar-link">
          Home
        </Link>
      </header>

      {error ? <p className="inbox-error">{error}</p> : null}

      {rows.length === 0 ? (
        <section className="inbox-empty">
          <p>No chats yet</p>
          <span>Open a product and tap Message seller.</span>
        </section>
      ) : (
        <ul className="inbox-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox/${c.id}`} className="inbox-row">
                <span className="inbox-thumb" aria-hidden>
                  {c.product?.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.product.imageSrc} alt="" />
                  ) : (
                    <span className="inbox-thumb-fallback">
                      {(c.shop?.name ?? "P").slice(0, 1)}
                    </span>
                  )}
                </span>
                <span className="inbox-body">
                  <span className="inbox-row-top">
                    <strong className="inbox-title">
                      {c.product?.title ?? "Product"}
                    </strong>
                    <time className="inbox-time" dateTime={c.lastMessageAt ?? undefined}>
                      {formatInboxTime(c.lastMessageAt)}
                    </time>
                  </span>
                  <span className="inbox-row-bottom">
                    <span className="inbox-preview">
                      {c.shop?.name ? `${c.shop.name}: ` : ""}
                      {c.lastMessagePreview || "No messages yet"}
                    </span>
                    {c.unread > 0 ? (
                      <span className="inbox-badge">{c.unread}</span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
