"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type {
  AdminChannel,
  AdminShop,
  ProductCounts,
} from "@/components/admin/types";

type ShopAdminContextValue = {
  shop: AdminShop | null;
  counts: ProductCounts | null;
  channels: AdminChannel[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const ShopAdminContext = createContext<ShopAdminContextValue | null>(null);

export function ShopAdminProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<AdminShop | null>(null);
  const [counts, setCounts] = useState<ProductCounts | null>(null);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const reload = useCallback(async () => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    void (async () => {
      if (!user) {
        await Promise.resolve();
        if (cancelled) return;
        setShop(null);
        setCounts(null);
        setChannels([]);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/shops/${encodeURIComponent(slug)}?owned=1`,
          { credentials: "include" },
        );
        const data = (await res.json()) as {
          shop?: AdminShop;
          counts?: ProductCounts;
          channels?: AdminChannel[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load shop");
        setShop(data.shop ?? null);
        setCounts(data.counts ?? null);
        setChannels(data.channels ?? []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load shop");
        setShop(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, slug, fetchKey]);

  return (
    <ShopAdminContext.Provider
      value={{ shop, counts, channels, loading, error, reload }}
    >
      {children}
    </ShopAdminContext.Provider>
  );
}

export function useShopAdmin() {
  const ctx = useContext(ShopAdminContext);
  if (!ctx) {
    throw new Error("useShopAdmin must be used within ShopAdminProvider");
  }
  return ctx;
}
