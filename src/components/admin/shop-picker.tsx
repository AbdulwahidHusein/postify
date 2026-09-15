"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminHomeShell } from "@/components/admin/admin-shop-shell";
import { useTelegram } from "@/lib/telegram/context";
import { useAuth } from "@/components/providers/auth-provider";
import { telegramBotUsername } from "@/lib/env";
import type { AdminShop } from "@/components/admin/types";
import { InlineLoader, PageLoader } from "@/components/ui/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const auth = searchParams.get("auth");
  const authNote =
    auth === "ok"
      ? "Signed in successfully."
      : auth === "expired"
        ? "That login link expired. Request a new one."
        : auth === "missing"
          ? "Login link was incomplete. Try again."
          : null;

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
          const list = shopsData.shops ?? [];
          setShops(list);
          setChannels(channelsData.channels ?? []);
          setError(null);
          setShopsLoading(false);
          if (list.length === 1) {
            router.replace(`/dashboard/s/${list[0]!.slug}`);
          }
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
  }, [user, router]);

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
        <PageLoader
          label={isTma ? "Signing you in" : "Checking session"}
        />
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
          <h1 className="admin-h1">Sign in</h1>
          <p className="admin-lead">Continue with Telegram.</p>
          {(authError || tmaError) && (
            <p className="admin-error">{authError || tmaError}</p>
          )}
          {isTma ? (
            <p className="admin-muted">Signing in…</p>
          ) : (
            <div className="admin-actions">
              {botLink ? (
                <Button asChild variant="primary">
                  <a href={botLink}>Continue in Telegram</a>
                </Button>
              ) : null}
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
            <h1 className="admin-h1">Your shops</h1>
            <p className="admin-lead">
              {user.firstName}
              {user.username ? ` (@${user.username})` : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
          >
            Sign out
          </Button>
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
          <InlineLoader label="Loading" />
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
                    <Badge variant={linked ? "success" : "neutral"}>
                      {linked ? "Connected" : "Setup"}
                    </Badge>
                  </div>
                  <p className="admin-muted">/{shop.slug}</p>
                  <p className="admin-shop-card-meta">
                    {linked
                      ? (linked.title ?? linked.username ?? "Channel linked")
                      : "Add the bot as admin"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {shops.length > 0 ? (
          <form
            id="create-store"
            className="admin-panel admin-form"
            onSubmit={onCreateShop}
          >
            <div>
              <h2 className="admin-h2">Add another shop</h2>
            </div>
            <label className="admin-field">
              <span>Name</span>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Shop name"
                required
                maxLength={80}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              disabled={creating || !name.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
        ) : null}
      </div>
    </AdminHomeShell>
  );
}
