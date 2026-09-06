"use client";

import { ShopAdminProvider } from "@/components/admin/shop-admin-context";
import { use } from "react";

export default function ShopAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ShopAdminProvider slug={slug}>{children}</ShopAdminProvider>;
}
