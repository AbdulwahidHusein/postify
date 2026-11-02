import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { getCustomer, serializeCustomer } from "@/server/domain/customers";
import { listOrders, serializeOrder } from "@/server/domain/orders";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { timeAgo } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrderStatus } from "@/components/status";
import { Stat } from "@/components/ui/field";
import { CustomerControls } from "@/components/dashboard/customer-controls";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop: handle, id } = await params;
  const { shop } = await requireShopPage(handle, "customers.view", `/dashboard/${handle}/customers/${id}`);
  const raw = await getCustomer(shop.id, id);
  if (!raw) notFound();
  const c = serializeCustomer(raw);
  const orders = await listOrders(shop.id, { customerId: id, limit: 50 });
  const base = `/dashboard/${shop.handle}`;
  return (
    <>
      <PageHeader back={{ href: `${base}/customers`, label: "Customers" }} title={c.name}
        description={<a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-signal"><Phone size={14} /> {formatPhone(c.phone)}</a>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Orders" value={c.orderCount} />
        <Stat label="Spent" value={formatMoney(c.totalSpentMinor, shop.currency)} />
        <Stat label="Cancelled" value={c.cancelCount} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="card divide-y divide-line">
          <h2 className="px-4 py-3 text-sm font-semibold">Orders</h2>
          {orders.items.map((raw) => {
            const o = serializeOrder(raw);
            return (
              <Link key={o.id} href={`${base}/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
                <span className="flex-1 text-sm">#{o.number} <span className="text-mist">· {timeAgo(o.placedAt)}</span></span>
                <span className="text-sm tabular-nums">{formatMoney(o.totalMinor, o.currency)}</span>
                <OrderStatus status={o.status} />
              </Link>
            );
          })}
        </section>
        <CustomerControls handle={shop.handle} id={c.id} notes={c.notes ?? ""} blocked={c.blocked} />
      </div>
    </>
  );
}
