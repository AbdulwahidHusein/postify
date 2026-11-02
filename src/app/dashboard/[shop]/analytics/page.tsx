import { requireShopPage } from "@/server/page";
import { shopAnalytics } from "@/server/domain/analytics";
import { postLink } from "@/server/services/telegram";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/dashboard/page-header";
import Link from "next/link";
import { TrendChart } from "@/components/charts/trend-chart";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "analytics.view", `/dashboard/${handle}/analytics`);
  const days = sp.days === "90" ? 90 : sp.days === "30" ? 30 : 7;
  const a = await shopAnalytics(shop.id, days);
  const base = `/dashboard/${shop.handle}/analytics`;

  const m = (v: bigint | number) => formatMoney(BigInt(v), shop.currency) ?? `${shop.currency} 0`;
  const fromPosts = a.topPosts.reduce((n, p) => n + p.orders, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="What buyers look at, ask about and order, and which Telegram posts bring sales."
        actions={
          <div className="flex rounded-[var(--radius-control)] bg-sunken p-1" role="tablist" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`${base}?days=${d}`} role="tab" aria-selected={d === days} className={cn("rounded-[8px] px-3 py-1.5 text-[13px] font-semibold", d === days ? "bg-surface text-ink shadow-sm" : "text-mist hover:text-ink")}>
                {d} days
              </Link>
            ))}
          </div>
        }
      />
      <section className="panel">
        <div className="grid grid-cols-2 border-b border-line sm:grid-cols-5">
          {[
            { label: "Sales", value: m(a.totals.revenueMinor) },
            { label: "Orders", value: a.totals.orders.toLocaleString("en-US") },
            { label: "Product views", value: a.totals.views.toLocaleString("en-US") },
            { label: "Questions", value: a.totals.inquiries.toLocaleString("en-US") },
            { label: "Views that order", value: `${(a.totals.conversion * 100).toFixed(1)}%` },
          ].map((k, i) => (
            <div key={k.label} className={cn("px-4 py-3.5 sm:px-5", i % 2 === 0 && i < 4 && "border-r border-line sm:border-r-0", i < 4 && "border-b border-line sm:border-b-0", i < 4 && "sm:border-r sm:border-line", i === 4 && "col-span-2 sm:col-span-1")}>
              <p className="text-[13px] text-mist">{k.label}</p>
              <p className="num mt-0.5 font-display text-xl font-semibold tracking-[-0.01em]">{k.value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">Sales and orders</p>
            <TrendChart points={a.points.map((p) => ({ day: p.day, value: Number(p.revenueMinor), secondary: p.orders }))} kind="money" currency={shop.currency} secondaryLabel="orders" height={170} summary={`Sales over ${days} days: ${m(a.totals.revenueMinor)}.`} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">Product views</p>
            <TrendChart points={a.points.map((p) => ({ day: p.day, value: p.views, secondary: p.inquiries }))} kind="count" secondaryLabel="questions" height={170} summary={`${a.totals.views} product views over ${days} days.`} />
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <RankTable
          title="Top products"
          empty="No activity in this period."
          rows={a.topProducts.map((p) => ({ key: p.productId ?? p.title, label: p.title, href: p.productId ? `/dashboard/${shop.handle}/products/${p.productId}` : undefined, views: p.views, orders: p.orders }))}
        />
        <RankTable
          title="Top Telegram posts"
          note={fromPosts ? `${fromPosts} orders came straight from post buttons` : undefined}
          empty="Buyers who arrive through your posts' Order buttons are counted here."
          rows={a.topPosts.map((p) => ({ key: p.sourceCode ?? p.productTitle, label: p.productTitle, external: postLink({ chatId: p.chatId, messageId: p.messageId }) ?? undefined, views: p.views, orders: p.orders }))}
        />
      </div>
    </>
  );
}

function RankTable({ title, note, empty, rows }: { title: string; note?: string; empty: string; rows: { key: string; label: string; href?: string; external?: string; views: number; orders: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {note ? <span className="text-[13px] text-mist">{note}</span> : null}
      </div>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas text-left text-xs text-mist">
              <th className="py-2 pl-5 pr-3 font-medium">Name</th>
              <th className="w-20 px-3 py-2 text-right font-medium">Views</th>
              <th className="w-20 py-2 pl-3 pr-5 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-0 py-2.5 pl-5 pr-3">
                  {r.href ? <Link href={r.href} className="block truncate font-medium hover:underline">{r.label}</Link> : r.external ? <a href={r.external} target="_blank" rel="noreferrer" className="block truncate font-medium text-[#106a96] hover:underline">{r.label}</a> : <span className="block truncate font-medium">{r.label}</span>}
                  <span className="mt-1.5 block h-1 rounded-full bg-sunken"><span className="block h-1 rounded-full bg-brand/70" style={{ width: `${(r.views / max) * 100}%` }} /></span>
                </td>
                <td className="num px-3 py-2.5 text-right text-ink-soft">{r.views}</td>
                <td className="num py-2.5 pl-3 pr-5 text-right font-semibold">{r.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-mist">{empty}</p>
      )}
    </section>
  );
}
