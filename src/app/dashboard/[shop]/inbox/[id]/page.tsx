import { requireShopPage } from "@/server/page";
import { PageHeader } from "@/components/dashboard/page-header";
import { SellerThread } from "@/components/chat/seller-thread";

export const dynamic = "force-dynamic";

export default async function SellerThreadPage({ params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop: handle, id } = await params;
  const { shop } = await requireShopPage(handle, "inbox.manage", `/dashboard/${handle}/inbox/${id}`);
  return (
    <>
      <PageHeader back={{ href: `/dashboard/${shop.handle}/inbox`, label: "Inbox" }} title="Conversation" />
      <SellerThread handle={shop.handle} id={id} />
    </>
  );
}
