import Link from "next/link";
import { Users } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { listCustomers, serializeCustomer } from "@/server/domain/customers";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { timeAgo } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBox } from "@/components/dashboard/tabs";
import { EmptyState } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop: handle } = await params;
  const sp = await searchParams;
  const { shop } = await requireShopPage(handle, "customers.view", `/dashboard/${handle}/customers`);
  const page = await listCustomers(shop.id, { q: sp.q, cursor: sp.cursor });
  const base = `/dashboard/${shop.handle}/customers`;
  return (
    <>
      <PageHeader title="Customers" description="Everyone who ordered from you, with their history." />
      <SearchBox action={base} defaultValue={sp.q} placeholder="Search by name or phone" />
      {page.items.length ? (
        <div className="card divide-y divide-line">
          {page.items.map((raw) => {
            const c = serializeCustomer(raw);
            return (
              <Link key={c.id} href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-muted">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">{c.name} {c.blocked ? <Badge variant="danger">Blocked</Badge> : c.flagged ? <Badge variant="warning">Cancels often</Badge> : null}</p>
                  <p className="text-xs text-mist">{formatPhone(c.phone)} · {c.orderCount} order{c.orderCount === 1 ? "" : "s"}{c.lastOrderAt ? ` · last ${timeAgo(c.lastOrderAt)}` : ""}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(c.totalSpentMinor, shop.currency)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Users size={28} />} title="No customers yet" body="Buyers appear here after their first order." />
      )}
      {page.nextCursor ? (
        <div className="mt-4 text-center"><Link href={`${base}?cursor=${encodeURIComponent(page.nextCursor)}`} className="text-sm font-medium text-signal">More →</Link></div>
      ) : null}
    </>
  );
}
