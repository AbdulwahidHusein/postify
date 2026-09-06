import type { Metadata } from "next";
import { ProductNewPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "New product",
};

type Props = PageProps<"/dashboard/s/[slug]/products/new">;

export default async function NewProductPage({ params }: Props) {
  const { slug } = await params;
  return <ProductNewPageClient shopSlug={slug} />;
}
