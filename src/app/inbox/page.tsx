import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/request";
import { listBuyerInbox } from "@/server/domain/chat";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function BuyerInbox() {
  const user = await getViewer();
  if (!user) redirect("/login?next=/inbox");
  const items = await listBuyerInbox(user.id);
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title">Messages</h1>
        <Link href="/account/orders" className="text-sm text-signal">My orders</Link>
      </div>
      {items.length ? (
        <div className="card divide-y divide-line">
          {items.map((c) => (
            <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
              {c.product?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.product.image} alt="" className="h-11 w-11 rounded-lg object-cover" />
              ) : <div className="h-11 w-11 rounded-lg bg-paper-muted" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.shop.name}</p>
                <p className="truncate text-sm text-mist">{c.product?.title ? `${c.product.title} · ` : ""}{c.preview}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-mist">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}</p>
                {c.unread ? <span className="rounded-full bg-signal px-1.5 text-xs font-semibold text-white">{c.unread}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : <p className="card px-4 py-10 text-center text-sm text-mist">No messages yet. Tap “Ask seller” on any product.</p>}
    </main>
  );
}
