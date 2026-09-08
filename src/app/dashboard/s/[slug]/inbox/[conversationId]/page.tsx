import type { Metadata } from "next";
import { InboxThreadPageClient } from "@/components/admin/shop-pages";

export const metadata: Metadata = {
  title: "Chat",
};

type Props = PageProps<"/dashboard/s/[slug]/inbox/[conversationId]">;

export default async function SellerInboxThreadPage({ params }: Props) {
  const { slug, conversationId } = await params;
  return (
    <InboxThreadPageClient shopSlug={slug} conversationId={conversationId} />
  );
}
