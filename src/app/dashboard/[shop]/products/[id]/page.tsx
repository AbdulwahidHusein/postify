import { notFound } from "next/navigation";
import { requireShopPage } from "@/server/page";
import { getProductBundle, serializeProduct } from "@/server/domain/products";
import { listChannels, serializeChannel } from "@/server/domain/channels";
import { postLink } from "@/server/services/telegram";
import { ProductEditor } from "@/components/dashboard/product-editor";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop: handle, id } = await params;
  const { shop } = await requireShopPage(handle, "products.manage", `/dashboard/${handle}/products/${id}`);
  const bundle = await getProductBundle(shop.id, id);
  if (!bundle) notFound();
  const chans = await listChannels(shop.id);
  const byId = new Map(chans.map((c) => [c.id, c]));
  return (
    <ProductEditor
      key={bundle.updatedAt.toISOString()}
      handle={shop.handle}
      product={serializeProduct(bundle)}
      sources={(bundle.sources ?? []).map((s) => ({
        id: s.id,
        channel: byId.get(s.channelId) ? serializeChannel(byId.get(s.channelId)!) : null,
        buttonMode: s.buttonMode,
        buttonStatus: s.buttonStatus,
        lastError: s.lastError,
        link: postLink({ username: byId.get(s.channelId)?.username, chatId: s.chatId, messageId: s.messageId }),
      }))}
      channels={chans.filter((c) => c.status === "connected" && (c.canPostMessages || c.chatType !== "channel")).map(serializeChannel)}
    />
  );
}
