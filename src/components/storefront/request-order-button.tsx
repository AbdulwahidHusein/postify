"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";

export function RequestOrderButton({
  productId,
  defaultName,
}: {
  productId: string;
  defaultName?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [buyerName, setBuyerName] = useState(defaultName ?? "");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const botLink = telegramBotUsername
    ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=auth_msg_${productId}`
    : `/auth/continue?message=${productId}`;

  if (loading) {
    return (
      <button type="button" className="btn btn-primary" disabled>
        Request order
      </button>
    );
  }

  if (!user) {
    return (
      <a href={botLink} className="btn btn-primary">
        Sign in to order
      </a>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerPhone,
          notes: notes.trim() || null,
          quantity,
        }),
      });
      const data = (await res.json()) as {
        conversationId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not place order");
      if (data.conversationId) {
        router.push(`/inbox/${data.conversationId}`);
        return;
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setBuyerName((n) => n || user.firstName || "");
          setOpen(true);
        }}
      >
        Request order
      </button>
    );
  }

  return (
    <form className="order-intent" onSubmit={onSubmit}>
      <p className="order-intent-title">Request this item</p>
      <p className="order-intent-lead">
        Seller gets a Telegram alert. Pay cash / transfer offline after they
        confirm.
      </p>
      <label className="order-field">
        <span>Your name</span>
        <input
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
        />
      </label>
      <label className="order-field">
        <span>Phone</span>
        <input
          value={buyerPhone}
          onChange={(e) => setBuyerPhone(e.target.value)}
          required
          maxLength={40}
          inputMode="tel"
          autoComplete="tel"
          placeholder="+251…"
        />
      </label>
      <label className="order-field">
        <span>Quantity</span>
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
        />
      </label>
      <label className="order-field">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Size, color, delivery area…"
        />
      </label>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="order-intent-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      <p className="buy-note">
        Opens your chat with the seller.{" "}
        <Link href="/inbox">Inbox</Link>
      </p>
    </form>
  );
}
