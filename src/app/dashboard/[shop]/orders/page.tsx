import Link from "next/link";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { countOrderTabs, listOrders, serializeOrder, type OrderTab } from "@/server/domain/orders";
import { formatMoney } from "@/lib/money";
import { timeAgo, dateTime } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs, SearchBox } from "@/components/dashboard/tabs";
import { OrderStatus, PaymentStatus } from "@/components/status";
import { Thumbs } from "@/components/dashboard/thumbs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const TABS: { key: OrderTab; label: string }[] = [
  { key: "to_confirm", label: "To confirm" },
  { key: "to_ship", label: "To deliver" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All orders" },
];

const EMPTY: Record<OrderTab, string> = {
  to_confirm: "No orders waiting. New ones also arrive in your Telegram chat with the bot.",
  to_ship: "Nothing to deliver right now.",
  delivered: "Delivered orders show up here.",
  cancelled: "No cancelled orders.",
  all: "Orders appear the moment a buyer taps Order on one of your posts.",
};

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "orders.manage", `/dashboard/${handle}/orders`);
  const counts = await countOrderTabs(shop.id);
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? (counts.to_confirm ? "to_confirm" : "all")) as OrderTab;
  const page = await listOrders(shop.id, { tab, q: sp.q, cursor: sp.cursor });
  const base = `/dashboard/${shop.handle}/orders`;
  const orders = page.items.map(serializeOrder);
  const query = (extra: string) => `${base}?tab=${tab}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${extra}`;

  return (
    <>
      <PageHeader title="Orders" description="Confirm, deliver and record payment. Buyers get each update in Telegram." />
      <div className="panel overflow-hidden">
        <div className="space-y-3 px-4 pt-3 sm:px-5">
          <LinkTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}`, count: t.key === "all" ? undefined : counts[t.key as keyof typeof counts] }))} />
          <div className="pb-3 sm:max-w-sm">
            <SearchBox action={base} defaultValue={sp.q} placeholder="Order number, name or phone" hidden={{ tab }} />
          </div>
        </div>
        {orders.length ? (
          <>
            {/* Desktop table */}
            <table className="hidden w-full border-t border-line text-sm md:table">
              <thead>
                <tr className="bg-canvas text-left text-xs text-mist">
                  <th className="py-2.5 pl-5 pr-3 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Items</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="py-2.5 pl-3 pr-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className={cn("group relative transition-colors hover:bg-canvas", o.status === "placed" && "bg-adey-soft/35")}>
                    <td className="py-3 pl-5 pr-3">
                      <Link href={`${base}/${o.id}`} className="num font-semibold after:absolute after:inset-0">#{o.number}</Link>
                      <p className="text-xs text-mist" title={dateTime(o.placedAt)}>{timeAgo(o.placedAt)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{o.contactName}</p>
                      <p className="max-w-[220px] truncate text-xs text-mist">{o.fulfillment === "pickup" ? "Pickup" : o.address}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Thumbs images={o.lines.map((l) => l.image)} />
                        <span className="max-w-[200px] truncate text-ink-soft">{o.lines.length === 1 ? o.lines[0].title : `${o.itemCount} items`}</span>
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-right font-semibold">{formatMoney(BigInt(o.totalMinor), o.currency)}</td>
                    <td className="px-3 py-3"><PaymentStatus status={o.paymentStatus} /></td>
                    <td className="py-3 pl-3 pr-5"><OrderStatus status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phone list */}
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/${o.id}`} className={cn("flex gap-3 px-4 py-3.5 active:bg-canvas", o.status === "placed" && "bg-adey-soft/35")}>
                    <Thumbs images={o.lines.map((l) => l.image)} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[15px] font-semibold">{o.contactName}</p>
                        <p className="num shrink-0 text-[15px] font-semibold">{formatMoney(BigInt(o.totalMinor), o.currency)}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-mist">
                        <span className="num">#{o.number}</span>, {o.lines.length === 1 ? o.lines[0].title : `${o.itemCount} items`}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <OrderStatus status={o.status} />
                        {o.paymentStatus === "paid" ? <PaymentStatus status="paid" /> : null}
                        <span className="ml-auto text-xs text-faint">{timeAgo(o.placedAt)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center border-t border-line px-6 py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-sunken text-ink-soft"><ShoppingBag size={20} /></span>
            <p className="font-display font-semibold">{sp.q ? `No orders match “${sp.q}”` : "Nothing here"}</p>
            <p className="mt-1 max-w-sm text-sm text-mist">{sp.q ? "Try the order number without #, or the buyer's phone number." : EMPTY[tab]}</p>
          </div>
        )}
        {sp.cursor || page.nextCursor ? (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 sm:px-5">
            {sp.cursor ? <Link href={query("")} className="flex items-center gap-1 text-[13px] font-semibold text-ink-soft hover:text-ink"><ChevronLeft size={15} /> Newest</Link> : <span />}
            {page.nextCursor ? <Link href={query(`&cursor=${page.nextCursor}`)} className="flex items-center gap-1 text-[13px] font-semibold text-ink-soft hover:text-ink">Older <ChevronRight size={15} /></Link> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
