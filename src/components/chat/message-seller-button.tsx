"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";

export function MessageSellerButton({
  productId,
  className = "btn btn-primary buy-cta-primary",
}: {
  productId: string;
  className?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const botLink = telegramBotUsername
    ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=auth_msg_${productId}`
    : `/auth/continue?message=${productId}`;

  if (loading) {
    return (
      <button type="button" className={className} disabled>
        Message seller
      </button>
    );
  }

  if (!user) {
    return (
      <div className="buy-actions">
        <a href={botLink} className={className}>
          Sign in to message
        </a>
        <p className="buy-note">Sign in with Telegram to chat about this item.</p>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/conversations`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        conversation?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not start chat");
      if (!data.conversation) throw new Error("Could not start chat");
      router.push(`/inbox/${data.conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start chat");
      setBusy(false);
    }
  }

  return (
    <div className="buy-actions">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => void start()}
      >
        {busy ? "Opening…" : "Message seller"}
      </button>
      {error ? <p className="admin-error">{error}</p> : null}
      <p className="buy-note">
        Chat in Postify — the seller gets a Telegram alert.{" "}
        <Link href="/inbox">Your inbox</Link>
      </p>
    </div>
  );
}
