import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { listSellerInbox } from "@/server/domain/chat";
import { timeAgo } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs } from "@/components/dashboard/tabs";
import { EmptyState } from "@/components/ui/field";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "inbox.manage", `/dashboard/${handle}/inbox`);
  const filter = sp.filter === "unread" ? "unread" : "all";
  const items = await listSellerInbox(shop.id, { unread: filter === "unread", productId: sp.product });
  const base = `/dashboard/${shop.handle}/inbox`;
  return (
    <>
      <PageHeader title="Inbox" description="Buyer questions about your products. You can also reply straight from the Telegram bot." />
      <LinkTabs active={filter} tabs={[{ key: "all", label: "All", href: base }, { key: "unread", label: "Unread", href: `${base}?filter=unread` }]} />
      {items.length ? (
        <div className="card divide-y divide-line">
          {items.map((c) => (
            <Link key={c.id} href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
              {c.product?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.product.image} alt="" className="h-11 w-11 rounded-lg object-cover" />
              ) : <div className="h-11 w-11 rounded-lg bg-paper-muted" />}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className={c.unread ? "font-semibold" : "font-medium"}>{c.buyer.name}</span>
                  <span className="truncate text-xs text-mist">{c.product?.title ?? "General question"}</span>
                </p>
                <p className={`truncate text-sm ${c.unread ? "text-ink" : "text-mist"}`}>{c.preview}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-mist">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}</span>
                {c.unread ? <span className="rounded-full bg-signal px-1.5 text-xs font-semibold text-accent-fg">{c.unread}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<MessageCircle size={28} />} title={filter === "unread" ? "No unread messages" : "No messages yet"} body="When buyers tap “Ask seller” on a post, their messages land here and in Telegram." />
      )}
    </>
  );
}
