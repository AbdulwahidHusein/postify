import type { Metadata } from "next";
import { SettingsPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
