import { requireShopPage } from "@/server/page";
import { storefrontUrl } from "@/server/domain/shops";
import { listCollections } from "@/server/domain/collections";
import { draftDesign, publishedDesign } from "@/server/domain/store-design";
import { PRESET_THEMES } from "@/lib/store-design";
import { PageHeader } from "@/components/dashboard/page-header";
import { StoreEditor } from "@/components/dashboard/store-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Online store" };

export default async function StorePage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "shop.settings", `/dashboard/${handle}/store`);
  const collections = await listCollections(shop.id);
  const live = publishedDesign(shop);
  const { hasDraft } = draftDesign(shop);
  return (
    <>
      <PageHeader title="Online store" description="Your storefront's look, collections and address." />
      <StoreEditor
        handle={shop.handle}
        address={storefrontUrl(shop.handle)}
        collections={collections}
        status={{ unpublished: hasDraft, publishedAt: shop.settings.designPublishedAt ?? null }}
        summary={{ theme: PRESET_THEMES[live.theme.preset].label, accent: live.theme.accent, sections: live.sections.filter((s) => !s.hidden).length }}
      />
    </>
  );
}
