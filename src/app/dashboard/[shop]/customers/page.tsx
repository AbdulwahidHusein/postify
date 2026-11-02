import Link from "next/link";
import { Users } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { listCustomers, serializeCustomer } from "@/server/domain/customers";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { timeAgo } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBox } from "@/components/dashboard/tabs";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "customers.view", `/dashboard/${handle}/customers`);
  const page = await listCustomers(shop.id, { q: sp.q, cursor: sp.cursor });
  const base = `/dashboard/${shop.handle}/customers`;
  const rows = page.items.map(serializeCustomer);
  const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has ordered from you. Call them, see their orders, or block a buyer." />
      <div className="panel overflow-hidden">
        <div className="p-3 sm:px-5 sm:py-3"><div className="sm:max-w-sm"><SearchBox action={base} defaultValue={sp.q} placeholder="Name or phone number" /></div></div>
        {rows.length ? (
          <>
            <table className="hidden w-full border-t border-line text-sm md:table">
              <thead>
                <tr className="bg-canvas text-left text-xs text-mist">
                  <th className="py-2.5 pl-5 pr-3 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spent</th>
                  <th className="py-2.5 pl-3 pr-5 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="relative transition-colors hover:bg-canvas">
                    <td className="py-3 pl-5 pr-3">
                      <Link href={`${base}/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold text-ink-soft">{initials(c.name)}</span>
                        <span className="font-semibold">{c.name}</span>
                        {c.blocked ? <Badge variant="danger" dot>Blocked</Badge> : c.flagged ? <Badge variant="warning" dot>Cancels often</Badge> : null}
                      </Link>
                    </td>
                    <td className="num px-3 py-3 text-ink-soft">{formatPhone(c.phone)}</td>
                    <td className="num px-3 py-3 text-right">{c.orderCount}</td>
                    <td className="num px-3 py-3 text-right font-semibold">{formatMoney(BigInt(c.totalSpentMinor), shop.currency)}</td>
                    <td className="py-3 pl-3 pr-5 text-mist">{c.lastOrderAt ? timeAgo(c.lastOrderAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-canvas">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-sm font-bold text-ink-soft">{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold">{c.name}</span>{c.blocked ? <Badge variant="danger">Blocked</Badge> : c.flagged ? <Badge variant="warning">Cancels often</Badge> : null}</span>
                      <span className="num block text-[13px] text-mist">{formatPhone(c.phone)}, {c.orderCount} order{c.orderCount === 1 ? "" : "s"}</span>
                    </span>
                    <span className="num text-sm font-semibold">{formatMoney(BigInt(c.totalSpentMinor), shop.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center border-t border-line px-6 py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-sunken text-ink-soft"><Users size={20} /></span>
            <p className="font-display font-semibold">{sp.q ? `No customers match “${sp.q}”` : "No customers yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-mist">{sp.q ? "Search by first name or the last digits of their phone." : "Buyers appear here after their first order."}</p>
          </div>
        )}
        {page.nextCursor ? (
          <div className="flex justify-end border-t border-line px-5 py-2.5"><Link href={`${base}?cursor=${encodeURIComponent(page.nextCursor)}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">Next page</Link></div>
        ) : null}
      </div>
    </>
  );
}
