"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShopShell } from "@/components/admin/admin-shop-shell";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { useAuth } from "@/components/providers/auth-provider";
import type { AdminProduct } from "@/components/admin/types";
import { telegramBotUsername } from "@/lib/env";

function SetupChecklist({
  shopSlug,
  hasChannel,
  productCount,
}: {
  shopSlug: string;
  hasChannel: boolean;
  productCount: number;
}) {
  const steps = [
    {
      id: "shop",
      label: "Shop created",
      done: true,
      href: null as string | null,
    },
    {
      id: "channel",
      label: "Connect Telegram channel",
      done: hasChannel,
      href: `/dashboard/s/${shopSlug}/channels`,
    },
    {
      id: "product",
      label: "Add your first product",
      done: productCount > 0,
      href: hasChannel
        ? `/dashboard/s/${shopSlug}/products/new`
        : `/dashboard/s/${shopSlug}/channels`,
    },
    {
      id: "storefront",
      label: "Preview storefront",
      done: productCount > 0,
      href: `/s/${shopSlug}`,
      external: true,
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  const next = steps.find((s) => !s.done);

  return (
    <section className="admin-panel admin-setup">
      <div className="admin-setup-head">
        <div>
          <p className="admin-kicker">Getting started</p>
          <h2 className="admin-h2">Finish setup</h2>
          <p className="admin-muted">
            {remaining} step{remaining === 1 ? "" : "s"} left — usually under
            10 minutes.
          </p>
        </div>
        {next?.href ? (
          <Link
            href={next.href}
            className="btn btn-primary btn-sm"
            {...(next.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {next.label}
          </Link>
        ) : null}
      </div>
      <ol className="admin-checklist">
        {steps.map((step) => (
          <li
            key={step.id}
            className={
              step.done ? "admin-checklist-done" : "admin-checklist-todo"
            }
          >
            <span className="admin-checklist-mark" aria-hidden>
              {step.done ? "✓" : ""}
            </span>
            {step.done || !step.href ? (
              <span>{step.label}</span>
            ) : (
              <Link href={step.href}>{step.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ShopOverview() {
  const { user, loading: authLoading } = useAuth();
  const { shop, counts, channels, loading, error, reload } = useShopAdmin();
  const [drafts, setDrafts] = useState<AdminProduct[]>([]);
  const [recent, setRecent] = useState<AdminProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [showCelebrate, setShowCelebrate] = useState(false);

  useEffect(() => {
    if (!shop) return;
    try {
      setShowCelebrate(
        sessionStorage.getItem(`postify:connected:${shop.id}`) === "1",
      );
    } catch {
      setShowCelebrate(false);
    }
  }, [shop, channels.length]);

  useEffect(() => {
    if (!shop || !user) return;
    let cancelled = false;
    void (async () => {
      setFeedLoading(true);
      try {
        const [draftRes, recentRes] = await Promise.all([
          fetch(
            `/api/shops/${encodeURIComponent(shop.slug)}/products?status=draft&limit=5`,
            { credentials: "include" },
          ),
          fetch(
            `/api/shops/${encodeURIComponent(shop.slug)}/products?limit=6`,
            { credentials: "include" },
          ),
        ]);
        const draftData = (await draftRes.json()) as {
          products?: AdminProduct[];
        };
        const recentData = (await recentRes.json()) as {
          products?: AdminProduct[];
        };
        if (cancelled) return;
        setDrafts(draftData.products ?? []);
        setRecent(recentData.products ?? []);
      } catch {
        if (!cancelled) {
          setDrafts([]);
          setRecent([]);
        }
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shop, user, counts?.total, counts?.draft]);

  function dismissConnected() {
    if (!shop) return;
    try {
      sessionStorage.removeItem(`postify:connected:${shop.id}`);
    } catch {
      // ignore
    }
    setShowCelebrate(false);
  }

  if (authLoading || loading) {
    return <p className="admin-loading">Loading shop…</p>;
  }

  if (!user) {
    return (
      <p className="admin-muted">
        <Link href="/dashboard">Sign in</Link> to manage this shop.
      </p>
    );
  }

  if (error || !shop) {
    return (
      <div className="admin-stack">
        <p className="admin-error">{error ?? "Shop not found"}</p>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          Back to shops
        </Link>
      </div>
    );
  }

  const channel = channels[0];
  const productCount = counts?.total ?? 0;
  const draftCount = counts?.draft ?? 0;

  return (
    <AdminShopShell shop={shop}>
      <div className="admin-stack">
        <header className="admin-section-head">
          <div>
            <p className="admin-kicker">Overview</p>
            <h1 className="admin-h1">{shop.name}</h1>
            <p className="admin-lead">
              {shop.description ||
                "Catalog, channel sync, and settings in one place."}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void reload()}
          >
            Refresh
          </button>
        </header>

        {showCelebrate ? (
          <section className="admin-banner admin-banner-success">
            <div>
              <strong>Channel connected</strong>
              <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                Post a photo + caption with a price in Telegram, or add a
                product here.
              </p>
            </div>
            <div className="admin-actions">
              <Link
                href={`/dashboard/s/${shop.slug}/products/new`}
                className="btn btn-primary btn-sm"
              >
                Add product
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={dismissConnected}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        <SetupChecklist
          shopSlug={shop.slug}
          hasChannel={Boolean(channel)}
          productCount={productCount}
        />

        <div className="admin-stat-grid">
          <div className="admin-stat">
            <span>Total</span>
            <strong>{counts?.total ?? 0}</strong>
          </div>
          <div className="admin-stat">
            <span>Published</span>
            <strong>{counts?.published ?? 0}</strong>
          </div>
          <div className="admin-stat">
            <span>Drafts</span>
            <strong>{draftCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Archived</span>
            <strong>{counts?.archived ?? 0}</strong>
          </div>
        </div>

        {draftCount > 0 ? (
          <section className="admin-panel">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Drafts</p>
                <h2 className="admin-h2">
                  {draftCount} unpublished draft{draftCount === 1 ? "" : "s"}
                </h2>
                <p className="admin-muted">
                  Manual drafts waiting to be published.
                </p>
              </div>
              <Link
                href={`/dashboard/s/${shop.slug}/products?status=draft`}
                className="btn btn-primary btn-sm"
              >
                Open drafts
              </Link>
            </div>
            {feedLoading ? (
              <p className="admin-muted">Loading…</p>
            ) : (
              <ul className="admin-feed">
                {drafts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/s/${shop.slug}/products/${p.id}`}
                      className="admin-feed-item"
                    >
                      <span>
                        <strong>{p.title}</strong>
                        {p.confidence != null ? (
                          <span className="admin-meta">
                            Confidence {(p.confidence * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </span>
                      <span className="admin-status admin-status-draft">
                        draft
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <div className="admin-split">
          <section className="admin-panel">
            <p className="admin-kicker">Catalog</p>
            <h2 className="admin-h2">Products</h2>
            <p className="admin-muted">
              {productCount === 0
                ? channel
                  ? "Post in Telegram or add a listing manually."
                  : "Connect a channel first, or add products by hand."
                : "Browse listings, fix prices, publish or archive."}
            </p>
            <div className="admin-actions">
              <Link
                href={`/dashboard/s/${shop.slug}/products`}
                className="btn btn-primary btn-sm"
              >
                Open catalog
              </Link>
              <Link
                href={`/dashboard/s/${shop.slug}/products/new`}
                className="btn btn-ghost btn-sm"
              >
                Add product
              </Link>
            </div>
          </section>

          <section className="admin-panel">
            <p className="admin-kicker">Telegram</p>
            <h2 className="admin-h2">
              {channel
                ? (channel.title ?? channel.username ?? "Connected")
                : "Not connected"}
            </h2>
            <p className="admin-muted">
              {channel
                ? channel.lastPostAt
                  ? `Last channel activity ${new Date(channel.lastPostAt).toLocaleString()}`
                  : "Waiting for posts"
                : telegramBotUsername
                  ? `Add @${telegramBotUsername.replace(/^@/, "")} as admin, then connect`
                  : "Connect a channel to sync posts"}
            </p>
            <div className="admin-actions">
              <Link
                href={`/dashboard/s/${shop.slug}/channels`}
                className="btn btn-ghost btn-sm"
              >
                {channel ? "Manage channel" : "Connect channel"}
              </Link>
            </div>
          </section>
        </div>

        {recent.length > 0 ? (
          <section className="admin-panel">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Recent activity</p>
                <h2 className="admin-h2">Latest listings</h2>
              </div>
            </div>
            <ul className="admin-feed">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/s/${shop.slug}/products/${p.id}`}
                    className="admin-feed-item"
                  >
                    <span>
                      <strong>{p.title}</strong>
                      <span className="admin-meta">
                        {p.channelId ? "From channel · " : ""}
                        {new Date(p.updatedAt).toLocaleString()}
                      </span>
                    </span>
                    <span className={`admin-status admin-status-${p.status}`}>
                      {p.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AdminShopShell>
  );
}
