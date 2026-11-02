import { requireShopPage } from "@/server/page";
import { serializeShop } from "@/server/domain/shops";
import { listCollections } from "@/server/domain/collections";
import { serverEnv } from "@/server/env";
import { publicUrl } from "@/server/services/storage";
import { PageHeader } from "@/components/dashboard/page-header";
import { StoreEditor } from "@/components/dashboard/store-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Online store" };

export default async function StorePage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "shop.settings", `/dashboard/${handle}/store`);
  const collections = await listCollections(shop.id);
  const s = serializeShop(shop);
  const root = serverEnv.ROOT_DOMAIN.split(":")[0];
  const address = root.includes("localhost") ? `${serverEnv.NEXT_PUBLIC_APP_URL}/s/${shop.handle}` : `https://${shop.handle}.${root}`;
  return (
    <>
      <PageHeader title="Online store" description="Your storefront's look, collections and address." />
      <StoreEditor shop={s} address={address} bannerUrl={s.settings.theme.bannerKey ? publicUrl(s.settings.theme.bannerKey) : null} collections={collections} />
    </>
  );
}
