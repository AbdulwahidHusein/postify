import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { countOrderTabs, listOrders, serializeOrder, type OrderTab } from "@/server/domain/orders";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs, SearchBox } from "@/components/dashboard/tabs";
import { OrderStatus, PaymentStatus } from "@/components/status";
import { EmptyState } from "@/components/ui/field";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const TABS: { key: OrderTab; label: string }[] = [
  { key: "to_confirm", label: "To confirm" },
  { key: "to_ship", label: "To deliver" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "orders.manage", `/dashboard/${handle}/orders`);
  const counts = await countOrderTabs(shop.id);
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? (counts.to_confirm ? "to_confirm" : "all")) as OrderTab;
  const page = await listOrders(shop.id, { tab, q: sp.q, cursor: sp.cursor });
  const base = `/dashboard/${shop.handle}/orders`;

  return (
    <>
      <PageHeader title="Orders" description="Confirm, deliver and get paid. Buyers get updates in Telegram automatically." />
      <LinkTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}`, count: t.key === "all" ? undefined : counts[t.key as keyof typeof counts] }))} />
      <SearchBox action={base} defaultValue={sp.q} placeholder="Search by order #, name or phone" hidden={{ tab }} />
      {page.items.length ? (
        <div className="card divide-y divide-line">
          {page.items.map((raw) => {
            const o = serializeOrder(raw);
            return (
              <Link key={o.id} href={`${base}/${o.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper-muted sm:grid-cols-[110px_1fr_auto_auto_auto]">
                <span className="text-sm font-semibold">#{o.number}</span>
                <span className="text-right text-sm font-semibold tabular-nums sm:order-4">{formatMoney(o.totalMinor, o.currency)}</span>
                <span className="min-w-0 truncate text-sm sm:order-2">
                  {o.contactName} <span className="text-mist">· {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {o.fulfillment === "pickup" ? "Pickup" : "Delivery"}</span>
                </span>
                <span className="flex justify-end gap-1.5 sm:order-5"><OrderStatus status={o.status} /></span>
                <span className="text-xs text-mist sm:order-3">{timeAgo(o.placedAt)} <span className="ml-1 inline-block align-middle"><PaymentStatus status={o.paymentStatus} /></span></span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<ShoppingBag size={28} />} title={sp.q ? "No matching orders" : "No orders here"} body="New orders appear here and in your Telegram chat with the bot." />
      )}
      {page.nextCursor ? (
        <div className="mt-4 text-center">
          <Link href={`${base}?tab=${tab}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}&cursor=${page.nextCursor}`} className="text-sm font-medium text-signal">Older orders →</Link>
        </div>
      ) : null}
    </>
  );
}
