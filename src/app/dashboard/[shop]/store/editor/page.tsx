import { and, eq } from "drizzle-orm";
import { requireShopPage } from "@/server/page";
import { shopLogoUrl, storefrontUrl } from "@/server/domain/shops";
import { listCollections } from "@/server/domain/collections";
import { storefrontCategories } from "@/server/domain/storefront";
import { draftDesign, previewToken } from "@/server/domain/store-design";
import { publicUrl } from "@/server/services/storage";
import { db } from "@/server/db";
import { channels } from "@/server/db/schema";
import { StoreCustomizer } from "@/components/dashboard/store-customizer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit store" };

export default async function StoreEditorPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "shop.settings", `/dashboard/${handle}/store/editor`);
  const [cols, cats, chan, token] = await Promise.all([
    listCollections(shop.id),
    storefrontCategories(shop.id),
    db.query.channels.findFirst({ where: and(eq(channels.shopId, shop.id), eq(channels.status, "connected"), eq(channels.chatType, "channel")), columns: { username: true } }),
    previewToken(shop.id),
  ]);
  const { design, hasDraft } = draftDesign(shop);
  const imageUrls: Record<string, string> = {};
  for (const s of design.sections) if ("imageKey" in s && s.imageKey) imageUrls[s.imageKey] = publicUrl(s.imageKey);

  return (
    <StoreCustomizer
      handle={shop.handle}
      shopName={shop.name}
      previewSrc={`/s/${shop.handle}/preview?token=${encodeURIComponent(token)}`}
      liveUrl={storefrontUrl(shop.handle)}
      initial={design}
      hasDraft={hasDraft}
      imageUrls={imageUrls}
      collections={cols.map((c) => ({ id: c.id, handle: c.handle, title: c.title }))}
      categories={cats.map((c) => c.name)}
      logoUrl={shopLogoUrl(shop)}
      hasChannel={Boolean(chan?.username)}
    />
  );
}
