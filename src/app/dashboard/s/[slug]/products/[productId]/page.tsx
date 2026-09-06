import type { Metadata } from "next";
import { ProductEditPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Edit product",
};

type Props = PageProps<"/dashboard/s/[slug]/products/[productId]">;

export default async function EditProductPage({ params }: Props) {
  const { slug, productId } = await params;
  return <ProductEditPageClient shopSlug={slug} productId={productId} />;
}
