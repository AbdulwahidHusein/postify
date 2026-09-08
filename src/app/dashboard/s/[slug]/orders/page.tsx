import type { Metadata } from "next";
import { OrdersPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Orders",
};

type Props = PageProps<"/dashboard/s/[slug]/orders">;

export default async function SellerOrdersPage({ params }: Props) {
  const { slug } = await params;
  return <OrdersPageClient shopSlug={slug} />;
}
