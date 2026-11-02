import Link from "next/link";
import { AlertTriangle, ChevronRight, MessageCircle, Package, Send, ShoppingBag, Truck } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { homeSummary } from "@/server/dashboard";
import { listOrders, serializeOrder } from "@/server/domain/orders";
import { botStartLink } from "@/server/services/telegram";
import { formatMoney } from "@/lib/money";
import { Stat } from "@/components/ui/field";
import { OrderStatus } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function HomePage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "shop.view", `/dashboard/${handle}`);
  const [s, recent] = await Promise.all([homeSummary(shop.id), listOrders(shop.id, { limit: 5 })]);
  const base = `/dashboard/${shop.handle}`;
  const todo = [
    { n: s.todo.toConfirm, label: "orders to confirm", href: `${base}/orders?tab=to_confirm`, icon: ShoppingBag, urgent: true },
    { n: s.todo.toShip, label: "orders to deliver", href: `${base}/orders?tab=to_ship`, icon: Truck },
    { n: s.todo.unread, label: "unread messages", href: `${base}/inbox?filter=unread`, icon: MessageCircle, urgent: true },
    { n: s.todo.needsPrice, label: "listings missing a price", href: `${base}/products?status=attention`, icon: Package },
    { n: s.todo.drafts, label: "drafts to review", href: `${base}/products?status=draft`, icon: Package },
    { n: s.todo.failingButtons, label: "posts with broken buttons", href: `${base}/telegram`, icon: AlertTriangle, urgent: true },
  ].filter((t) => t.n > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Today</h1>
        <p className="mt-1 text-sm text-mist">{shop.name}</p>
      </div>

      {s.setup.channels === 0 ? (
        <div className="card flex flex-col gap-4 border-signal/30 bg-accent-soft p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold">Connect your Telegram channel or group</p>
            <p className="mt-1 text-sm text-mist">Every post with a photo and a price becomes a product with an Order button.</p>
          </div>
          <a href={botStartLink("connect")} className={buttonVariants()}><Send size={16} /> Connect</a>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={s.today.orders} />
        <Stat label="Sales" value={formatMoney(s.today.revenueMinor, shop.currency) ?? "ETB 0"} />
        <Stat label="Views" value={s.today.views} />
        <Stat label="Inquiries" value={s.today.inquiries} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mist">To do</h2>
        {todo.length ? (
          <div className="card divide-y divide-line">
            {todo.map((t) => (
              <Link key={t.label} href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
                <t.icon size={18} className={t.urgent ? "text-warning" : "text-mist"} />
                <span className="text-sm"><b className="tabular-nums">{t.n}</b> {t.label}</span>
                <ChevronRight size={16} className="ml-auto text-mist" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-mist">You&apos;re all caught up.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mist">Recent orders</h2>
          <Link href={`${base}/orders`} className="text-sm text-signal">All orders</Link>
        </div>
        {recent.items.length ? (
          <div className="card divide-y divide-line">
            {recent.items.map((raw) => {
              const o = serializeOrder(raw);
              return (
                <Link key={o.id} href={`${base}/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">#{o.number} · {o.contactName}</p>
                    <p className="truncate text-xs text-mist">{o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {timeAgo(o.placedAt)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(o.totalMinor, o.currency)}</span>
                  <OrderStatus status={o.status} />
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-mist">No orders yet. Share your shop link or keep posting in your channel.</p>
        )}
      </section>
    </div>
  );
}
