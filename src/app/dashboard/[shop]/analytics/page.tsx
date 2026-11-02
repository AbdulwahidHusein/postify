import { requireShopPage } from "@/server/page";
import { shopAnalytics } from "@/server/domain/analytics";
import { postLink } from "@/server/services/telegram";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs } from "@/components/dashboard/tabs";
import { Stat } from "@/components/ui/field";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "analytics.view", `/dashboard/${handle}/analytics`);
  const days = sp.days === "90" ? 90 : sp.days === "30" ? 30 : 7;
  const a = await shopAnalytics(shop.id, days);
  const base = `/dashboard/${shop.handle}/analytics`;
  const maxViews = Math.max(1, ...a.points.map((p) => p.views));
  const maxOrders = Math.max(1, ...a.points.map((p) => p.orders));

  return (
    <>
      <PageHeader title="Analytics" description="What buyers look at, ask about and order, and which Telegram posts bring sales." />
      <LinkTabs active={String(days)} tabs={[7, 30, 90].map((d) => ({ key: String(d), label: `${d} days`, href: `${base}?days=${d}` }))} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Sales" value={formatMoney(a.totals.revenueMinor, shop.currency) ?? "ETB 0"} />
        <Stat label="Orders" value={a.totals.orders} />
        <Stat label="Views" value={a.totals.views} />
        <Stat label="Inquiries" value={a.totals.inquiries} />
        <Stat label="Conversion" value={`${(a.totals.conversion * 100).toFixed(1)}%`} hint="Orders per view" />
      </section>

      <section className="card mt-5 p-4">
        <div className="mb-3 flex items-center gap-4 text-xs text-mist">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-signal/30" /> Views</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-signal" /> Orders</span>
        </div>
        <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Views and orders per day for the last ${days} days`}>
          {a.points.map((p) => (
            <div key={p.day} className="group relative flex h-full flex-1 items-end gap-[1px]" title={`${p.day}: ${p.views} views, ${p.orders} orders`}>
              <div className="flex-1 rounded-t bg-signal/30" style={{ height: `${(p.views / maxViews) * 100}%`, minHeight: p.views ? 2 : 0 }} />
              <div className="flex-1 rounded-t bg-signal" style={{ height: `${(p.orders / maxOrders) * 100}%`, minHeight: p.orders ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-mist">
          <span>{a.points[0]?.day}</span><span>{a.points.at(-1)?.day}</span>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Top products</h2>
          {a.topProducts.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-mist"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Views</th><th className="px-4 py-2 text-right font-medium">Orders</th></tr></thead>
              <tbody className="divide-y divide-line">
                {a.topProducts.map((p) => (
                  <tr key={p.productId}><td className="max-w-0 truncate px-4 py-2">{p.title}</td><td className="px-2 py-2 text-right tabular-nums">{p.views}</td><td className="px-4 py-2 text-right tabular-nums">{p.orders}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-4 py-6 text-sm text-mist">No activity in this period.</p>}
        </section>
        <section className="card">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Top Telegram posts</h2>
          {a.topPosts.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-mist"><th className="px-4 py-2 font-medium">Post</th><th className="px-2 py-2 text-right font-medium">Views</th><th className="px-4 py-2 text-right font-medium">Orders</th></tr></thead>
              <tbody className="divide-y divide-line">
                {a.topPosts.map((p) => {
                  const link = postLink({ chatId: p.chatId, messageId: p.messageId });
                  return (
                    <tr key={p.sourceCode}>
                      <td className="max-w-0 truncate px-4 py-2">{link ? <a href={link} target="_blank" className="text-signal hover:underline">{p.productTitle}</a> : p.productTitle}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{p.views}</td><td className="px-4 py-2 text-right tabular-nums">{p.orders}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="px-4 py-6 text-sm text-mist">Buyers who arrive from your posts&apos; buttons are counted here.</p>}
        </section>
      </div>
    </>
  );
}
