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
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

const TABS = [
  { key: "all", label: "All products" },
  { key: "published", label: "Active" },
  { key: "attention", label: "Needs attention" },
  { key: "draft", label: "Drafts" },
  { key: "sold", label: "Sold" },
  { key: "archived", label: "Archived" },
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
  const countFor = (k: string) => (k === "all" || k === "attention" ? undefined : counts[k as keyof typeof counts]);
  const keep = `status=${status}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.channel ? `&channel=${sp.channel}` : ""}`;

  return (
    <>
      <PageHeader
        title="Products"
        description="Posts from your channels land here automatically. Edit details, prices and stock in one place."
        actions={<Link href={`${base}/new`} className={buttonVariants()}><Plus size={16} /> Add product</Link>}
      />
      <ProductTable
        handle={shop.handle}
        items={page.items.map(serializeProduct)}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
        emptyTitle={sp.q ? `No products match “${sp.q}”` : status === "attention" ? "Nothing needs attention" : "No products here"}
        emptyHint={sp.q ? "Try a shorter search, or look in another tab." : status === "attention" ? "Posts missing a price or details land here first." : "Post a photo with a price in your Telegram channel, or add a product here."}
        toolbar={
          <div className="space-y-3 px-4 pt-3 sm:px-5">
            <LinkTabs active={status ?? "all"} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?status=${t.key}`, count: countFor(t.key) }))} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
              <div className="w-full sm:max-w-sm"><SearchBox action={base} defaultValue={sp.q} placeholder="Search products" hidden={status ? { status } : undefined} /></div>
              {chans.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-mist">From</span>
                  {[{ id: "", title: "Anywhere" }, ...chans.map((c) => ({ id: c.id, title: c.title ?? "Chat" }))].map((c) => (
                    <Link
                      key={c.id || "any"}
                      href={`${base}?status=${status}${c.id ? `&channel=${c.id}` : ""}`}
                      className={cn("rounded-full px-2.5 py-1", (sp.channel ?? "") === c.id ? "bg-ink font-semibold text-white" : "bg-sunken font-medium text-ink-soft hover:text-ink")}
                    >
                      {c.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        }
        footer={
          page.nextCursor || sp.cursor ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 sm:px-5">
              {sp.cursor ? <Link href={`${base}?${keep}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">First page</Link> : <span />}
              {page.nextCursor ? <Link href={`${base}?${keep}&cursor=${page.nextCursor}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">Next page</Link> : null}
            </div>
          ) : null
        }
      />
    </>
  );
}
