import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Inbox",
};

type Props = PageProps<"/dashboard/s/[slug]/inbox">;

export default async function SellerInboxPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="admin-loading">Loading…</p>}>
      <InboxPageClient shopSlug={slug} />
    </Suspense>
  );
}
