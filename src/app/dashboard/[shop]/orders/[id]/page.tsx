import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, MapPin, MessageSquareText, Phone, Store } from "lucide-react";
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

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop: handle, id } = await params;
  const { shop } = await requireShopPage(handle, "orders.manage", `/dashboard/${handle}/orders/${id}`);
  const raw = await getOrder(shop.id, id);
  if (!raw) notFound();
  const o = serializeOrder(raw);
  const customer = serializeCustomer(raw.customer);
  const base = `/dashboard/${shop.handle}`;
  const m = (v: string | bigint) => formatMoney(BigInt(v), o.currency);

  return (
    <>
      <PageHeader
        back={{ href: `${base}/orders`, label: "Orders" }}
        title={<span className="num">Order #{o.number}</span>}
        meta={<><OrderStatus status={o.status} /><PaymentStatus status={o.paymentStatus} /></>}
        description={`Placed ${dateTime(o.placedAt)}, ${o.fulfillment === "pickup" ? "pickup" : "delivery"}, pay on delivery`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <OrderActions handle={shop.handle} order={o} />

          <section className="panel overflow-hidden" aria-labelledby="items-title">
            <div className="panel-head">
              <h2 id="items-title" className="panel-title">Items</h2>
              <span className="num text-[13px] text-mist">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>
            </div>
            <ul className="divide-y divide-line">
              {o.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3.5 px-4 py-3 sm:px-5">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-line" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-xl bg-sunken" />
                  )}
                  <div className="min-w-0 flex-1">
                    {l.productId ? (
                      <Link href={`${base}/products/${l.productId}`} className="block truncate text-sm font-semibold hover:underline">{l.title}</Link>
                    ) : (
                      <p className="truncate text-sm font-semibold">{l.title}</p>
                    )}
                    {l.variantTitle ? <p className="text-xs text-mist">{l.variantTitle}</p> : null}
                    <p className="num text-[13px] text-mist">{m(l.unitPriceMinor)} × {l.quantity}</p>
                  </div>
                  <span className="num text-sm font-semibold">{m(BigInt(l.unitPriceMinor) * BigInt(l.quantity))}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line bg-canvas px-4 py-3.5 text-sm sm:px-5">
              <div className="flex justify-between"><dt className="text-mist">Subtotal</dt><dd className="num">{m(o.subtotalMinor)}</dd></div>
              {o.fulfillment === "delivery" ? (
                <div className="flex justify-between"><dt className="text-mist">Delivery</dt><dd className="num">{BigInt(o.deliveryFeeMinor) > 0n ? m(o.deliveryFeeMinor) : "Free"}</dd></div>
              ) : null}
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold">{o.paymentStatus === "paid" ? "Paid" : "To collect"}</dt>
                <dd className="num font-display text-lg font-semibold">{m(o.totalMinor)}</dd>
              </div>
            </dl>
          </section>

          {o.notes ? (
            <section className="panel flex gap-3 px-4 py-3.5 sm:px-5">
              <MessageSquareText size={17} className="mt-0.5 shrink-0 text-mist" />
              <div>
                <h2 className="text-sm font-semibold">Note from the buyer</h2>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{o.notes}</p>
              </div>
            </section>
          ) : null}
          {o.cancelReason ? (
            <p className="panel px-4 py-3 text-sm text-mist sm:px-5">Cancelled: {o.cancelReason}</p>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="panel" aria-labelledby="cust-title">
            <div className="panel-head">
              <h2 id="cust-title" className="panel-title">Customer</h2>
              <Link href={`${base}/customers/${customer.id}`} className="text-[13px] font-semibold text-brand hover:underline">Profile</Link>
            </div>
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <div>
                <p className="font-semibold">{o.contactName}</p>
                <p className="text-xs text-mist">
                  {customer.orderCount === 1 ? "First order" : `${customer.orderCount} orders`}
                  {customer.cancelCount ? `, ${customer.cancelCount} cancelled` : ""}
                </p>
              </div>
              <a href={`tel:${o.contactPhone}`} className="flex items-center gap-2.5 text-sm font-medium text-ink hover:text-brand">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-sunken"><Phone size={15} /></span>
                <span className="num">{formatPhone(o.contactPhone)}</span>
              </a>
              <div className="flex items-start gap-2.5 text-sm">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sunken">
                  {o.fulfillment === "pickup" ? <Store size={15} /> : <MapPin size={15} />}
                </span>
                <span className="pt-1.5 text-ink-soft">{o.fulfillment === "pickup" ? "Picks up from your shop" : o.address}</span>
              </div>
              {customer.flagged ? (
                <p className="flex gap-2 rounded-xl bg-adey-soft px-3 py-2.5 text-[13px] text-adey-ink">
                  <CircleAlert size={15} className="mt-0.5 shrink-0" /> This buyer often cancels. Confirm by phone before sending anything out.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
