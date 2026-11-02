import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/request";
import { listBuyerOrders, serializeOrder } from "@/server/domain/orders";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { OrderStatus } from "@/components/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "My orders" };

export default async function MyOrders() {
  const user = await getViewer();
  if (!user) redirect("/login?next=/account/orders");
  const rows = await listBuyerOrders(user.id);
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title">My orders</h1>
        <Link href="/inbox" className="text-sm text-signal">Messages</Link>
      </div>
      {rows.length ? (
        <div className="card divide-y divide-line">
          {rows.map((raw) => {
            const o = serializeOrder(raw);
            return (
              <Link key={o.id} href={`/s/${raw.shop.handle}/orders/${o.number}?t=${raw.accessToken}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{raw.shop.name} · #{o.number}</p>
                  <p className="truncate text-xs text-mist">{o.lines.map((l) => l.title).join(", ")} · {timeAgo(o.placedAt)}</p>
                </div>
                <span className="text-sm tabular-nums">{formatMoney(o.totalMinor, o.currency)}</span>
                <OrderStatus status={o.status} />
              </Link>
            );
          })}
        </div>
      ) : <p className="card px-4 py-10 text-center text-sm text-mist">No orders yet.</p>}
    </main>
  );
}
