import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopPicker } from "@/components/admin/shop-picker";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="admin-loading">Loading…</p>}>
      <ShopPicker />
    </Suspense>
  );
}
