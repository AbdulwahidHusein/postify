import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Products",
};

type Props = PageProps<"/dashboard/s/[slug]/products">;

export default async function ProductsPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="admin-loading">Loading catalog…</p>}>
      <ProductsPageClient shopSlug={slug} />
    </Suspense>
  );
}
