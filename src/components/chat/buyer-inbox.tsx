"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChatConversation } from "@/components/chat/chat-thread";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";

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

  if (authLoading || loading) {
    return <p className="chat-muted">Loading inbox…</p>;
  }

  if (!user) {
    const botLink = telegramBotUsername
      ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=auth_inbox`
      : "/inbox";
    return (
      <section className="chat-empty-panel">
        <h1>Inbox</h1>
        <p>Sign in with Telegram to message sellers about products.</p>
        <a href={botLink} className="btn btn-primary">
          Sign in
        </a>
      </section>
    );
  }

  return (
    <div className="chat-inbox">
      <header className="chat-inbox-head">
        <div>
          <p className="admin-kicker">Messages</p>
          <h1 className="admin-h1">Inbox</h1>
        </div>
        <Link href="/" className="btn btn-ghost btn-sm">
          Home
        </Link>
      </header>
      {error ? <p className="admin-error">{error}</p> : null}
      {rows.length === 0 ? (
        <section className="admin-empty">
          <h2>No chats yet</h2>
          <p>Open a product and tap Message seller to start.</p>
        </section>
      ) : (
        <ul className="chat-inbox-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox/${c.id}`} className="chat-inbox-row">
                <span className="chat-product-thumb" aria-hidden>
                  {c.product?.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.product.imageSrc} alt="" />
                  ) : null}
                </span>
                <span className="chat-inbox-copy">
                  <strong>{c.product?.title ?? "Product"}</strong>
                  <span className="chat-inbox-meta">
                    {c.shop?.name}
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
