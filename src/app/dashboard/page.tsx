import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopPicker } from "@/components/admin/shop-picker";
import { PageLoader } from "@/components/ui/loader";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading dashboard" />}>
      <ShopPicker />
    </Suspense>
  );
}
