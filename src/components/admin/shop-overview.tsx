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
        sessionStorage.getItem(`goods:connected:${shop.id}`) === "1",
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
      sessionStorage.removeItem(`goods:connected:${shop.id}`);
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
  const draftCount = counts?.draft ?? 0;
  const liveCount = counts?.published ?? 0;

  if (!channel) {
    return (
      <AdminShopShell shop={shop}>
        <SetupWizard
          onConnected={() => {
            try {
              sessionStorage.setItem(`goods:connected:${shop.id}`, "1");
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
              {liveCount} live
              {draftCount > 0 ? ` · ${draftCount} draft${draftCount === 1 ? "" : "s"}` : ""}
              {(counts?.sold ?? 0) > 0
                ? ` · ${counts?.sold} sold`
                : ""}
            </p>
          </div>
          <div className="admin-actions">
            <Link
              href={`/dashboard/s/${shop.slug}/products/new`}
              className="btn btn-primary btn-sm"
            >
              Add product
            </Link>
            <Link
              href={`/s/${shop.slug}`}
              className="btn btn-ghost btn-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              View shop
            </Link>
          </div>
        </header>

        {showCelebrate ? (
          <section className="admin-banner admin-banner-success">
            <div>
              <strong>Channel connected</strong>
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

        {draftCount > 0 ? (
          <section className="admin-panel">
            <div className="admin-section-head">
              <div>
                <h2 className="admin-h2">
                  {draftCount} draft{draftCount === 1 ? "" : "s"}
                </h2>
              </div>
              <Link
                href={`/dashboard/s/${shop.slug}/products?status=draft`}
                className="btn btn-ghost btn-sm"
              >
                Review
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

        {recent.length > 0 ? (
          <section className="admin-panel">
            <div className="admin-section-head">
              <div>
                <h2 className="admin-h2">Latest products</h2>
              </div>
              <Link
                href={`/dashboard/s/${shop.slug}/products`}
                className="btn btn-ghost btn-sm"
              >
                All products
              </Link>
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
                        {new Date(p.updatedAt).toLocaleDateString()}
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
        ) : (
          <section className="admin-panel">
            <h2 className="admin-h2">No products yet</h2>
            <p className="admin-muted">
              Post in Telegram or add a listing manually.
            </p>
            <div className="admin-actions">
              <Link
                href={`/dashboard/s/${shop.slug}/products/new`}
                className="btn btn-primary btn-sm"
              >
                Add product
              </Link>
            </div>
          </section>
        )}
      </div>
    </AdminShopShell>
  );
}
