"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShopShell } from "@/components/admin/admin-shop-shell";
import { SetupWizard } from "@/components/admin/setup-wizard";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { useAuth } from "@/components/providers/auth-provider";
import type { AdminProduct } from "@/components/admin/types";
import { InlineLoader, PageLoader } from "@/components/ui/loader";

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
    return <PageLoader label="Loading shop" />;
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

  if (!channel) {
    return (
      <AdminShopShell shop={shop}>
        <SetupWizard
          onConnected={() => {
            try {
              sessionStorage.setItem(`postify:connected:${shop.id}`, "1");
            } catch {
              // ignore
            }
            void reload();
          }}
        />
      </AdminShopShell>
    );
  }

  return (
    <AdminShopShell shop={shop}>
      <div className="admin-stack">
        <header className="admin-section-head">
          <div>
            <h1 className="admin-h1">{shop.name}</h1>
            <p className="admin-lead">
              {shop.description || "Your catalog and orders."}
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
              <strong>Connected</strong>
              <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                Post a photo with a price in Telegram.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={dismissConnected}
            >
              Dismiss
            </button>
          </section>
        ) : null}

        <div className="admin-stat-grid">
          <div className="admin-stat">
            <span>Live</span>
            <strong>{counts?.published ?? 0}</strong>
          </div>
          <div className="admin-stat">
            <span>Drafts</span>
            <strong>{draftCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Sold</span>
            <strong>{counts?.sold ?? 0}</strong>
          </div>
          <div className="admin-stat">
            <span>Total</span>
            <strong>{counts?.total ?? 0}</strong>
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
              <InlineLoader label="Loading" />
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

        {(counts?.sold ?? 0) > 0 ? (
          <section className="admin-panel">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Sold</p>
                <h2 className="admin-h2">
                  {counts?.sold} sold item{counts?.sold === 1 ? "" : "s"}
                </h2>
                <p className="admin-muted">
                  Hidden from the public shop. Relist anytime.
                </p>
              </div>
              <Link
                href={`/dashboard/s/${shop.slug}/products?status=sold`}
                className="btn btn-ghost btn-sm"
              >
                View sold
              </Link>
            </div>
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
                : "Browse listings, mark sold, publish or archive."}
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
              {channel.lastPostAt
                ? `Last activity ${new Date(channel.lastPostAt).toLocaleString()}`
                : "Waiting for posts"}
            </p>
            <div className="admin-actions">
              <Link
                href={`/dashboard/s/${shop.slug}/channels`}
                className="btn btn-ghost btn-sm"
              >
                Channel
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
