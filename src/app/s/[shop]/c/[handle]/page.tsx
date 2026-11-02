import { notFound } from "next/navigation";
import { getStorefront } from "@/server/page";
import { collectionByHandle } from "@/server/domain/collections";
import { listStorefrontProducts } from "@/server/domain/storefront";
import { ProductCard } from "@/components/store/product-card";

export default async function CollectionPage({ params }: { params: Promise<{ shop: string; handle: string }> }) {
  const { shop: sp, handle } = await params;
  const { shop, base, locale } = await getStorefront(sp);
  const col = await collectionByHandle(shop.id, handle);
  if (!col) notFound();
  const page = await listStorefrontProducts(shop.id, { collectionId: col.id, limit: 60 });
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{col.title}</h1>
      {col.description ? <p className="mb-5 text-mist">{col.description}</p> : <div className="mb-5" />}
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {page.items.map((p) => <ProductCard key={p.id} p={p} base={base} locale={locale} />)}
      </div>
    </>
  );
}
