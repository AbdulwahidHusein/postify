import type { Metadata } from "next";
import { ShopOverview } from "@/components/admin/shop-overview";

export const metadata: Metadata = {
  title: "Shop",
};

export default function ShopOverviewPage() {
  return <ShopOverview />;
}
