"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShopShell } from "@/components/admin/admin-shop-shell";
import { ChannelPanel } from "@/components/admin/channel-panel";
import { ProductForm } from "@/components/admin/product-form";
import { ProductTable } from "@/components/admin/product-table";
import { SettingsForm } from "@/components/admin/settings-form";
import { SellerInboxList } from "@/components/chat/seller-inbox";
import { ChatThread } from "@/components/chat/chat-thread";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { useAuth } from "@/components/providers/auth-provider";
import type { AdminShop } from "@/components/admin/types";

function Gate({
  children,
}: {
  children: (shop: AdminShop) => ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { shop, loading, error } = useShopAdmin();

  if (authLoading || loading) {
    return <p className="admin-loading">Loading…</p>;
  }
  if (!user) {
    return (
      <p className="admin-muted">
        <Link href="/dashboard">Sign in</Link> to continue.
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

  return <AdminShopShell shop={shop}>{children(shop)}</AdminShopShell>;
}

export function ProductsPageClient({ shopSlug }: { shopSlug: string }) {
  const searchParams = useSearchParams();
  const { channels } = useShopAdmin();
  const statusParam = searchParams.get("status") ?? "all";
  const initialStatus =
    statusParam === "draft" ||
    statusParam === "published" ||
    statusParam === "sold" ||
    statusParam === "archived" ||
    statusParam === "all"
      ? statusParam
      : "all";

  return (
    <Gate>
      {() => (
        <ProductTable
          shopSlug={shopSlug}
          initialStatus={initialStatus}
          channelConnected={channels.length > 0}
        />
      )}
    </Gate>
  );
}

export function ProductNewPageClient({ shopSlug }: { shopSlug: string }) {
  return (
    <Gate>
      {(shop) => (
        <ProductForm
          shopSlug={shopSlug}
          defaultCurrency={shop.settings.defaultCurrency ?? "ETB"}
        />
      )}
    </Gate>
  );
}

export function ProductEditPageClient({
  shopSlug,
  productId,
}: {
  shopSlug: string;
  productId: string;
}) {
  return (
    <Gate>
      {(shop) => (
        <ProductForm
          shopSlug={shopSlug}
          productId={productId}
          defaultCurrency={shop.settings.defaultCurrency ?? "ETB"}
        />
      )}
    </Gate>
  );
}

export function ChannelsPageClient() {
  return (
    <Gate>
      {() => <ChannelPanel />}
    </Gate>
  );
}

export function SettingsPageClient() {
  return (
    <Gate>
      {() => <SettingsForm />}
    </Gate>
  );
}

export function InboxPageClient({ shopSlug }: { shopSlug: string }) {
  return (
    <Gate>
      {() => <SellerInboxList shopSlug={shopSlug} />}
    </Gate>
  );
}

export function InboxThreadPageClient({
  shopSlug,
  conversationId,
}: {
  shopSlug: string;
  conversationId: string;
}) {
  return (
    <Gate>
      {() => (
        <ChatThread
          conversationId={conversationId}
          role="seller"
          showClose
          backHref={`/dashboard/s/${shopSlug}/inbox`}
          backLabel="Inbox"
        />
      )}
    </Gate>
  );
}
