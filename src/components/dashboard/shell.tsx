"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChartColumn, ChevronDown, Ellipsis, House, MessageCircle, Package, Search, Send, Settings, ShoppingBag, Store, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";

type ShopRef = { handle: string; name: string; logoUrl: string | null };

type NavItem = { href: string; label: string; icon: typeof House; badge?: number; action?: string };

export function DashboardShell({
  shop,
  shops,
  actions,
  badges,
  children,
}: {
  shop: ShopRef;
  shops: ShopRef[];
  actions: string[];
  badges: { orders: number; inbox: number; attention: number };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/dashboard/${shop.handle}`;
  const [cmdOpen, setCmdOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const nav: NavItem[] = useMemo(
    () =>
      [
        { href: base, label: "Home", icon: House },
        { href: `${base}/orders`, label: "Orders", icon: ShoppingBag, badge: badges.orders, action: "orders.manage" },
        { href: `${base}/products`, label: "Products", icon: Package, badge: badges.attention, action: "products.manage" },
        { href: `${base}/customers`, label: "Customers", icon: Users, action: "customers.view" },
        { href: `${base}/inbox`, label: "Inbox", icon: MessageCircle, badge: badges.inbox, action: "inbox.manage" },
        { href: `${base}/analytics`, label: "Analytics", icon: ChartColumn, action: "analytics.view" },
        { href: `${base}/telegram`, label: "Telegram", icon: Send, action: "channels.manage" },
        { href: `${base}/store`, label: "Online store", icon: Store, action: "shop.settings" },
        { href: `${base}/settings`, label: "Settings", icon: Settings, action: "shop.view" },
      ].filter((n) => !n.action || actions.includes(n.action)),
    [base, badges, actions],
  );

  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  // ⌘K / Ctrl+K opens the command bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Inside Telegram: native back button everywhere except Home.
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void } } } }).Telegram?.WebApp;
    if (!tg?.initData || !tg.BackButton) return;
    const back = () => router.back();
    if (pathname === base) tg.BackButton.hide();
    else {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    }
    return () => tg.BackButton?.offClick(back);
  }, [pathname, base, router]);

  const tabs = nav.filter((n) => ["Home", "Orders", "Products", "Inbox"].includes(n.label));
  const rest = nav.filter((n) => !tabs.includes(n));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <ShopSwitcher shop={shop} shops={shops} />
        <button
          onClick={() => setCmdOpen(true)}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-mist hover:bg-paper-muted"
        >
          <Search size={16} /> Search
          <kbd className="ml-auto rounded border border-line px-1.5 text-[10px]">⌘K</kbd>
        </button>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(n.href) ? "bg-accent-soft text-signal" : "text-ink-soft hover:bg-paper-muted",
              )}
            >
              <n.icon size={18} />
              {n.label}
              {n.badge ? (
                <span className="ml-auto rounded-full bg-signal px-1.5 text-xs font-semibold text-white tabular-nums">{n.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <Link href={`/s/${shop.handle}`} target="_blank" className="m-3 rounded-lg border border-line px-3 py-2 text-sm text-mist hover:bg-paper-muted">
          View storefront ↗
        </Link>
      </aside>

      {/* Top bar (phones) */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <ShopSwitcher shop={shop} shops={shops} compact />
        <button aria-label="Search" onClick={() => setCmdOpen(true)} className="ml-auto rounded-lg p-2 text-mist hover:bg-paper-muted">
          <Search size={20} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>

      {/* Bottom tabs (phones) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((n) => (
          <Link key={n.href} href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(n.href) ? "text-signal" : "text-mist")}>
            <n.icon size={20} />
            {n.label}
            {n.badge ? <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-danger" /> : null}
          </Link>
        ))}
        <button onClick={() => setMoreOpen(true)} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", rest.some((n) => isActive(n.href)) ? "text-signal" : "text-mist")}>
          <Ellipsis size={20} />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <div className="grid grid-cols-2 gap-2">
          {rest.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)} className="card flex items-center gap-3 p-3 text-sm font-medium">
              <n.icon size={18} className="text-signal" /> {n.label}
            </Link>
          ))}
          <Link href={`/s/${shop.handle}`} onClick={() => setMoreOpen(false)} className="card flex items-center gap-3 p-3 text-sm font-medium">
            <Store size={18} className="text-signal" /> View storefront
          </Link>
        </div>
      </Dialog>

      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} handle={shop.handle} nav={nav} />
    </div>
  );
}

function ShopSwitcher({ shop, shops, compact }: { shop: ShopRef; shops: ShopRef[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative", compact ? "" : "p-3")}>
      <button onClick={() => setOpen((o) => !o)} className={cn("flex w-full items-center gap-2.5 rounded-lg text-left", compact ? "" : "px-2 py-2 hover:bg-paper-muted")}>
        <ShopAvatar shop={shop} />
        <span className="truncate text-sm font-semibold">{shop.name}</span>
        <ChevronDown size={16} className="shrink-0 text-mist" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {shops.map((s) => (
            <Link key={s.handle} href={`/dashboard/${s.handle}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-paper-muted">
              <ShopAvatar shop={s} /> <span className="truncate">{s.name}</span>
            </Link>
          ))}
          <Link href="/dashboard/new" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-2 text-sm text-signal hover:bg-paper-muted">
            + Create another shop
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ShopAvatar({ shop, size = 28 }: { shop: { name: string; logoUrl: string | null }; size?: number }) {
  return shop.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-signal text-xs font-bold text-white" style={{ width: size, height: size }}>
      {shop.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

type SearchResult = {
  products: { id: string; title: string; status: string }[];
  orders: { id: string; number: number; name: string; status: string }[];
  customers: { id: string; name: string; phone: string }[];
};

function CommandBar({ open, onOpenChange, handle, nav }: { open: boolean; onOpenChange: (o: boolean) => void; handle: string; nav: NavItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);

  const setOpen = (o: boolean) => {
    if (!o) {
      setQ("");
      setRes(null);
    }
    onOpenChange(o);
  };

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<SearchResult>(`/api/shops/${handle}/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(setRes)
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, handle]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const base = `/dashboard/${handle}`;
  const pages = nav.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = q.trim().length < 2 ? null : res;

  return (
    <Dialog open={open} onOpenChange={setOpen} title="Search" className="sm:top-[20%] sm:translate-y-0">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Products, order #, customer name or phone…" className="input" />
      <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto">
        {shown?.orders.length ? (
          <Group title="Orders">
            {shown.orders.map((o) => (
              <Row key={o.id} onClick={() => go(`${base}/orders/${o.id}`)}>#{o.number} · {o.name}</Row>
            ))}
          </Group>
        ) : null}
        {shown?.products.length ? (
          <Group title="Products">
            {shown.products.map((p) => (
              <Row key={p.id} onClick={() => go(`${base}/products/${p.id}`)}>{p.title}</Row>
            ))}
          </Group>
        ) : null}
        {shown?.customers.length ? (
          <Group title="Customers">
            {shown.customers.map((c) => (
              <Row key={c.id} onClick={() => go(`${base}/customers/${c.id}`)}>{c.name} · {c.phone}</Row>
            ))}
          </Group>
        ) : null}
        <Group title="Go to">
          {pages.map((n) => (
            <Row key={n.href} onClick={() => go(n.href)}>{n.label}</Row>
          ))}
          <Row onClick={() => go(`${base}/products/new`)}>Add product</Row>
        </Group>
      </div>
    </Dialog>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-mist">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-paper-muted">
      {children}
    </button>
  );
}
