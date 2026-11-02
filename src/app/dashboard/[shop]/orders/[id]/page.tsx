import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Store } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { getOrder, serializeOrder } from "@/server/domain/orders";
import { serializeCustomer } from "@/server/domain/customers";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { dateTime } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrderStatus, PaymentStatus } from "@/components/status";
import { OrderActions } from "@/components/dashboard/order-actions";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop: handle, id } = await params;
  const { shop } = await requireShopPage(handle, "orders.manage", `/dashboard/${handle}/orders/${id}`);
  const raw = await getOrder(shop.id, id);
  if (!raw) notFound();
  const o = serializeOrder(raw);
  const customer = serializeCustomer(raw.customer);
  const base = `/dashboard/${shop.handle}`;
  const timeline = [
    { label: "Placed", at: o.placedAt },
    { label: "Confirmed", at: o.confirmedAt },
    { label: "Shipped", at: o.shippedAt },
    { label: "Delivered", at: o.deliveredAt },
    { label: "Completed", at: o.completedAt },
    { label: "Cancelled", at: o.cancelledAt },
  ].filter((t) => t.at);

  return (
    <>
      <PageHeader
        back={{ href: `${base}/orders`, label: "Orders" }}
        title={<span className="flex flex-wrap items-center gap-2">Order #{o.number} <OrderStatus status={o.status} /> <PaymentStatus status={o.paymentStatus} /></span>}
        description={`Placed ${dateTime(o.placedAt)}`}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <OrderActions handle={shop.handle} order={o} />
          <section className="card">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Items</h2>
            <div className="divide-y divide-line">
              {o.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-paper-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    {l.productId ? (
                      <Link href={`${base}/products/${l.productId}`} className="block truncate text-sm font-medium hover:underline">{l.title}</Link>
                    ) : (
                      <p className="truncate text-sm font-medium">{l.title}</p>
                    )}
                    <p className="text-xs text-mist">{formatMoney(l.unitPriceMinor, o.currency)} × {l.quantity}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(BigInt(l.unitPriceMinor) * BigInt(l.quantity), o.currency)}</span>
                </div>
              ))}
            </div>
            <dl className="space-y-1 border-t border-line px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-mist">Subtotal</dt><dd className="tabular-nums">{formatMoney(o.subtotalMinor, o.currency)}</dd></div>
              {o.fulfillment === "delivery" ? (
                <div className="flex justify-between"><dt className="text-mist">Delivery</dt><dd className="tabular-nums">{formatMoney(o.deliveryFeeMinor, o.currency)}</dd></div>
              ) : null}
              <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(o.totalMinor, o.currency)}</dd></div>
              <p className="pt-1 text-xs text-mist">Payment: pay on delivery (cash or transfer)</p>
            </dl>
          </section>
          {o.notes ? (
            <section className="card px-4 py-3">
              <h2 className="text-sm font-semibold">Note from buyer</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{o.notes}</p>
            </section>
          ) : null}
        </div>
        <aside className="space-y-5">
          <section className="card space-y-3 px-4 py-4">
            <h2 className="text-sm font-semibold">Customer</h2>
            <Link href={`${base}/customers/${customer.id}`} className="block text-sm font-medium hover:underline">{o.contactName}</Link>
            <a href={`tel:${o.contactPhone}`} className="flex items-center gap-2 text-sm text-signal"><Phone size={15} /> {formatPhone(o.contactPhone)}</a>
            <p className="flex items-start gap-2 text-sm">
              {o.fulfillment === "pickup" ? <Store size={15} className="mt-0.5 text-mist" /> : <MapPin size={15} className="mt-0.5 text-mist" />}
              <span>{o.fulfillment === "pickup" ? "Pickup from your shop" : o.address}</span>
            </p>
            <p className="text-xs text-mist">{customer.orderCount} order{customer.orderCount === 1 ? "" : "s"}{customer.cancelCount ? ` · ${customer.cancelCount} cancelled` : ""}</p>
            {customer.flagged ? <p className="rounded-lg bg-warning/10 px-2 py-1.5 text-xs text-warning">This buyer cancels often. Confirm by phone before sending.</p> : null}
          </section>
          <section className="card px-4 py-4">
            <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
            <ol className="space-y-2">
              {timeline.map((t) => (
                <li key={t.label} className="flex justify-between text-sm"><span>{t.label}</span><span className="text-mist">{dateTime(t.at!)}</span></li>
              ))}
            </ol>
            {o.cancelReason ? <p className="mt-2 text-xs text-mist">Reason: {o.cancelReason}</p> : null}
          </section>
        </aside>
      </div>
    </>
  );
}
