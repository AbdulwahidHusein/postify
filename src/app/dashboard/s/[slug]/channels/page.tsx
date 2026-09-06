import type { Metadata } from "next";
import { ChannelsPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Channels",
};

export default function ChannelsPage() {
  return <ChannelsPageClient />;
}
