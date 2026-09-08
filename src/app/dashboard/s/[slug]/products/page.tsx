import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsPageClient } from "@/components/admin/shop-pages";
import { PageLoader } from "@/components/ui/loader";

export const metadata: Metadata = {
  title: "Products",
};

type Props = PageProps<"/dashboard/s/[slug]/products">;

export default async function ProductsPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<PageLoader label="Loading catalog" />}>
      <ProductsPageClient shopSlug={slug} />
    </Suspense>
  );
}
