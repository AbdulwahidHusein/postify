import Link from "next/link";
import { Plus } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { countByStatus, listProducts, serializeProduct, type ProductListFilters } from "@/server/domain/products";
import { listCollections } from "@/server/domain/collections";
import { listChannels } from "@/server/domain/channels";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs, SearchBox } from "@/components/dashboard/tabs";
import { ProductTable } from "@/components/dashboard/product-table";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

const TABS = [
  { key: "published", label: "Active" },
  { key: "attention", label: "Needs attention" },
  { key: "draft", label: "Drafts" },
  { key: "sold", label: "Sold" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "products.manage", `/dashboard/${handle}/products`);
  const status = (TABS.find((t) => t.key === sp.status)?.key ?? "all") as ProductListFilters["status"];
  const [page, counts, collections, chans] = await Promise.all([
    listProducts(shop.id, { status, q: sp.q, cursor: sp.cursor, channelId: sp.channel, collectionId: sp.collection }),
    countByStatus(shop.id),
    listCollections(shop.id),
    listChannels(shop.id),
  ]);
  const base = `/dashboard/${shop.handle}/products`;
  const countFor = (k: string) =>
    k === "all" ? undefined : k === "attention" ? undefined : counts[k as keyof typeof counts];

  return (
    <>
      <PageHeader
        title="Products"
        description="Posts from your channel appear here automatically. Fix details, prices and stock in one place."
        actions={<Link href={`${base}/new`} className={buttonVariants()}><Plus size={16} /> Add product</Link>}
      />
      <LinkTabs active={status ?? "all"} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?status=${t.key}`, count: countFor(t.key) }))} />
      <SearchBox action={base} defaultValue={sp.q} placeholder="Search products" hidden={status ? { status } : undefined} />
      {chans.length > 1 ? (
        <div className="-mt-2 mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-mist">Source:</span>
          <Link href={`${base}?status=${status}`} className={!sp.channel ? "font-semibold text-signal" : "text-mist"}>Any</Link>
          {chans.map((c) => (
            <Link key={c.id} href={`${base}?status=${status}&channel=${c.id}`} className={sp.channel === c.id ? "font-semibold text-signal" : "text-mist"}>{c.title ?? "Chat"}</Link>
          ))}
        </div>
      ) : null}
      <ProductTable
        handle={shop.handle}
        items={page.items.map(serializeProduct)}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
        emptyHint={sp.q ? "No products match your search." : status === "attention" ? "Nothing needs attention." : "Post a product in your Telegram channel, or add one here."}
      />
      {page.nextCursor ? (
        <div className="mt-4 text-center">
          <Link href={`${base}?status=${status}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}&cursor=${page.nextCursor}`} className="text-sm font-medium text-signal">Next page →</Link>
        </div>
      ) : null}
    </>
  );
}
