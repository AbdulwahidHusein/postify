import { requireShopPage } from "@/server/page";
import { ProductEditor } from "@/components/dashboard/product-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add product" };

export default async function NewProductPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "products.manage", `/dashboard/${handle}/products/new`);
  return <ProductEditor handle={shop.handle} product={null} />;
}
