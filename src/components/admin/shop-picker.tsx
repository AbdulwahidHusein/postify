"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminHomeShell } from "@/components/admin/admin-shop-shell";
import { useTelegram } from "@/lib/telegram/context";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";
import type { AdminShop } from "@/components/admin/types";

type ChannelRow = {
  id: string;
  shopId: string;
  title: string | null;
  username: string | null;
  lastPostAt: string | null;
};

export function ShopPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTma, error: tmaError } = useTelegram();
  const { user, loading, error: authError, logout } = useAuth();
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const botHandle = telegramBotUsername
    ? `@${telegramBotUsername.replace(/^@/, "")}`
    : null;

  useEffect(() => {
    const auth = searchParams.get("auth");
    if (auth === "ok") setAuthNote("Signed in successfully.");
    else if (auth === "expired")
      setAuthNote("That login link expired. Request a new one.");
    else if (auth === "missing")
      setAuthNote("Login link was incomplete. Try again.");
    else setAuthNote(null);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [shopsRes, channelsRes] = await Promise.all([
          fetch("/api/shops", { credentials: "include" }),
          fetch("/api/channels/connect", { credentials: "include" }),
        ]);
        const shopsData = (await shopsRes.json()) as {
          shops?: AdminShop[];
          error?: string;
        };
        const channelsData = (await channelsRes.json()) as {
          channels?: ChannelRow[];
          error?: string;
        };
        if (!shopsRes.ok) {
          throw new Error(shopsData.error ?? "Failed to load shops");
        }
        if (!channelsRes.ok) {
          throw new Error(channelsData.error ?? "Failed to load channels");
        }
        if (!cancelled) {
          setShops(shopsData.shops ?? []);
          setChannels(channelsData.channels ?? []);
          setError(null);
          setShopsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setShopsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onCreateShop(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        shop?: AdminShop;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not create shop");
      if (data.shop) {
        router.push(`/dashboard/s/${data.shop.slug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create shop");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <AdminHomeShell>
        <p className="admin-loading">
          {isTma ? "Signing you in…" : "Checking session…"}
        </p>
      </AdminHomeShell>
    );
  }

  if (!user) {
    const botLink = telegramBotUsername
      ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=auth`
      : null;

    return (
      <AdminHomeShell>
        <section className="admin-panel admin-auth">
          <p className="admin-kicker">Sign in</p>
          <h1 className="admin-h1">Welcome back</h1>
          <p className="admin-lead">
            Sign in with Telegram to manage shops, products, and channels.
          </p>
          {(authError || tmaError) && (
            <p className="admin-error">{authError || tmaError}</p>
          )}
          {isTma ? (
            <p className="admin-muted">Signing you in from Telegram…</p>
          ) : (
            <div className="admin-actions">
              {botLink ? (
                <a className="btn btn-primary" href={botLink}>
                  Continue in Telegram
                </a>
              ) : null}
              <p className="admin-hint">
                Opens {botHandle ?? "the bot"}. Tap Start, then confirm login.
              </p>
            </div>
          )}
        </section>
      </AdminHomeShell>
    );
  }

  return (
    <AdminHomeShell>
      <div className="admin-stack">
        <header className="admin-section-head">
          <div>
            <p className="admin-kicker">Workspace</p>
            <h1 className="admin-h1">Your shops</h1>
            <p className="admin-lead">
              Signed in as {user.firstName}
              {user.username ? ` (@${user.username})` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => logout()}
          >
            Sign out
          </button>
        </header>

        {error ? <p className="admin-error">{error}</p> : null}
        {authNote ? (
          <p
            className={
              authNote.startsWith("Signed")
                ? "admin-success"
                : "admin-error"
            }
          >
            {authNote}
          </p>
        ) : null}

        {shopsLoading ? (
          <p className="admin-loading">Loading shops…</p>
        ) : shops.length === 0 ? (
          <section className="admin-empty">
            <h2>Create your first shop</h2>
            <p>
              Then connect a Telegram channel and start managing your catalog.
            </p>
          </section>
        ) : (
          <div className="admin-shop-grid">
            {shops.map((shop) => {
              const linked = channels.find((c) => c.shopId === shop.id);
              return (
                <Link
                  key={shop.id}
                  href={`/dashboard/s/${shop.slug}`}
                  className="admin-shop-card"
                >
                  <div className="admin-shop-card-top">
                    <h2>{shop.name}</h2>
                    <span className="admin-chip">
                      {linked ? "Connected" : "Setup"}
                    </span>
                  </div>
                  <p className="admin-muted">/{shop.slug}</p>
                  <p className="admin-shop-card-meta">
                    {linked
                      ? `Channel · ${linked.title ?? linked.username ?? "linked"}`
                      : "No channel linked yet"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <form className="admin-panel admin-form" onSubmit={onCreateShop}>
          <div>
            <p className="admin-kicker">New shop</p>
            <h2 className="admin-h2">Create a shop</h2>
          </div>
          <label className="admin-field">
            <span>Name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mint Closet"
              required
              maxLength={80}
            />
          </label>
          <label className="admin-field">
            <span>Description (optional)</span>
            <textarea
              className="field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resale fashion from Addis"
              rows={3}
              maxLength={500}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating || !name.trim()}
          >
            {creating ? "Creating…" : "Create shop"}
          </button>
        </form>
      </div>
    </AdminHomeShell>
  );
}
