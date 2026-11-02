"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight, ChartColumn, Check, ChevronsUpDown, CornerDownLeft, Ellipsis, House, MessageCircle, Package, Plus, Search, Send,
  Settings, ShoppingBag, Store, User, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";
import { GoodsLogo } from "@/components/brand";

type ShopRef = { handle: string; name: string; logoUrl: string | null };
type NavItem = { href: string; label: string; icon: typeof House; badge?: number; badgeTone?: "attention" | "count"; action?: string; group: "main" | "channels" | "insights" | "admin" };

export function DashboardShell({
  shop,
  shops,
  actions,
  badges,
  storeUrl,
  storeHost,
  children,
}: {
  shop: ShopRef;
  shops: ShopRef[];
  actions: string[];
  badges: { orders: number; inbox: number; attention: number };
  storeUrl?: string;
  storeHost?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/dashboard/${shop.handle}`;
  const store = storeUrl ?? `/s/${shop.handle}`;
  const [cmdOpen, setCmdOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const nav: NavItem[] = useMemo(
    () =>
      (
        [
          { href: base, label: "Home", icon: House, group: "main" },
          { href: `${base}/orders`, label: "Orders", icon: ShoppingBag, badge: badges.orders, badgeTone: "attention", action: "orders.manage", group: "main" },
          { href: `${base}/products`, label: "Products", icon: Package, badge: badges.attention, badgeTone: "attention", action: "products.manage", group: "main" },
          { href: `${base}/customers`, label: "Customers", icon: Users, action: "customers.view", group: "main" },
          { href: `${base}/inbox`, label: "Inbox", icon: MessageCircle, badge: badges.inbox, badgeTone: "count", action: "inbox.manage", group: "main" },
          { href: `${base}/telegram`, label: "Telegram", icon: Send, action: "channels.manage", group: "channels" },
          { href: `${base}/store`, label: "Online store", icon: Store, action: "shop.settings", group: "channels" },
          { href: `${base}/analytics`, label: "Analytics", icon: ChartColumn, action: "analytics.view", group: "insights" },
          { href: `${base}/settings`, label: "Settings", icon: Settings, action: "shop.view", group: "admin" },
        ] satisfies NavItem[]
      ).filter((n) => !n.action || actions.includes(n.action)),
    [base, badges, actions],
  );

  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  // ⌘K / Ctrl+K opens search from anywhere.
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
  const groups: { key: NavItem["group"]; label?: string }[] = [
    { key: "main" },
    { key: "channels", label: "Sales channels" },
    { key: "insights" },
  ];

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-canvas lg:flex">
        <div className="px-3 pt-3">
          <ShopSwitcher shop={shop} shops={shops} host={storeHost} />
          <button
            onClick={() => setCmdOpen(true)}
            className="mt-3 flex h-11 w-full items-center gap-2 rounded-full border-2 border-transparent bg-surface px-4 text-sm font-semibold text-mist transition-colors hover:border-line-strong"
          >
            <Search size={15} /> Search
            <span className="ml-auto flex gap-0.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
          </button>
        </div>
        <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4" aria-label="Dashboard">
          {groups.map((g) => {
            const items = nav.filter((n) => n.group === g.key);
            if (!items.length) return null;
            return (
              <div key={g.key} className="mb-4">
                {g.label ? <p className="px-4 pb-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-faint">{g.label}</p> : null}
                <div className="space-y-1">
                  {items.map((n) => <SideLink key={n.href} item={n} active={isActive(n.href)} />)}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-line px-3 py-3">
          {nav.filter((n) => n.group === "admin").map((n) => <SideLink key={n.href} item={n} active={isActive(n.href)} />)}
          <a href={store} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-3 rounded-full px-4 font-display text-[15px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink">
            <Store size={18} strokeWidth={2} /> View your store <ArrowUpRight size={14} className="ml-auto text-faint" />
          </a>
          <Link href="/account/orders" className="flex h-11 items-center gap-3 rounded-full px-4 font-display text-[15px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink">
            <User size={18} strokeWidth={2} /> Your account
          </Link>
        </div>
        <div className="px-5 pb-4">
          <GoodsLogo size={24} />
        </div>
      </aside>

      {/* Top bar (phones) */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-1.5 bg-canvas/90 px-3 backdrop-blur-md lg:hidden">
        <ShopSwitcher shop={shop} shops={shops} compact />
        <button aria-label="Search" onClick={() => setCmdOpen(true)} className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-surface text-ink hover:bg-sunken">
          <Search size={20} />
        </button>
        <a aria-label="View your store" href={store} target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink hover:bg-sunken">
          <Store size={20} />
        </a>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">{children}</main>

      {/* Bottom tabs (phones) */}
      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-bar backdrop-blur-md lg:hidden">
        {tabs.map((n) => {
          const on = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 font-display text-[11px] font-semibold", on ? "text-ink" : "text-mist")}>
              <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors duration-200", on && "bg-ink text-brand")}>
                <n.icon size={19} strokeWidth={on ? 2.2 : 1.9} />
              </span>
              {n.label}
              {n.badge ? <TabBadge n={n.badge} tone={n.badgeTone} /> : null}
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} className={cn("flex h-16 flex-col items-center justify-center gap-1 font-display text-[11px] font-semibold", rest.some((n) => isActive(n.href)) ? "text-ink" : "text-mist")}>
          <span className={cn("grid h-8 w-14 place-items-center rounded-full", rest.some((n) => isActive(n.href)) && "bg-ink text-brand")}>
            <Ellipsis size={19} />
          </span>
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title={shop.name}>
        <div className="-mx-2 divide-y divide-line">
          {[...rest, { href: store, label: "View your store", icon: Store, group: "admin" as const }, { href: "/account/orders", label: "Your account", icon: User, group: "admin" as const }].map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-[16px] px-2 py-3 font-display text-[15px] font-semibold hover:bg-sunken">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken text-ink"><n.icon size={18} /></span>
              {n.label}
              {n.href === store ? <ArrowUpRight size={15} className="ml-auto text-faint" /> : null}
            </Link>
          ))}
        </div>
      </Dialog>

      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} handle={shop.handle} nav={nav} />
    </div>
  );
}

function TabBadge({ n, tone }: { n: number; tone?: NavItem["badgeTone"] }) {
  return (
    <span className={cn("num absolute left-1/2 top-1.5 ml-2 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] ring-2 ring-surface", tone === "attention" ? "bg-brand text-brand-fg" : "bg-ink text-white")}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function SideLink({ item: n, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={n.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-full px-4 font-display text-[15px] font-semibold transition-colors duration-150",
        active ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken hover:text-ink",
      )}
    >
      <n.icon size={18} strokeWidth={active ? 2.4 : 2} className={cn(active ? "text-brand" : "text-mist group-hover:text-ink-soft")} />
      {n.label}
      {n.badge ? (
        <span className={cn("num ml-auto min-w-[22px] rounded-full px-1.5 text-center text-[12px] font-extrabold leading-[22px]", n.badgeTone === "attention" ? "bg-brand text-brand-fg" : active ? "bg-white text-ink" : "bg-ink text-white")}>
          {n.badge > 99 ? "99+" : n.badge}
        </span>
      ) : null}
    </Link>
  );
}

function ShopSwitcher({ shop, shops, compact, host }: { shop: ShopRef; shops: ShopRef[]; compact?: boolean; host?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-[20px] text-left transition-colors hover:bg-sunken", compact ? "px-1.5 py-1.5" : "bg-surface px-2.5 py-2.5")}
      >
        <ShopAvatar shop={shop} size={compact ? 30 : 32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[16px] font-bold leading-tight tracking-[-0.01em]">{shop.name}</span>
          {!compact && host ? <span className="block truncate text-xs font-semibold text-mist">{host}</span> : null}
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-faint" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-full z-40 mt-2 w-72 animate-fade-in rounded-[20px] bg-surface p-1.5 shadow-pop">
          <p className="px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-[0.06em] text-faint">Your shops</p>
          {shops.map((s) => (
            <Link key={s.handle} role="menuitem" href={`/dashboard/${s.handle}`} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-sm hover:bg-sunken">
              <ShopAvatar shop={s} size={28} /> <span className="min-w-0 flex-1 truncate font-display font-semibold">{s.name}</span>
              {s.handle === shop.handle ? <Check size={15} className="text-brand-ink" /> : null}
            </Link>
          ))}
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/dashboard/new" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-[14px] px-2.5 py-2 font-display text-sm font-semibold text-ink hover:bg-sunken">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-brand-fg"><Plus size={15} strokeWidth={2.6} /></span>
            Create another shop
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ShopAvatar({ shop, size = 28 }: { shop: { name: string; logoUrl: string | null }; size?: number }) {
  const r = Math.round(size * 0.3);
  return shop.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logoUrl} alt="" width={size} height={size} className="shrink-0 object-cover ring-1 ring-line" style={{ width: size, height: size, borderRadius: r }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center bg-brand font-display font-bold text-brand-fg"
      style={{ width: size, height: size, borderRadius: r, fontSize: Math.round(size * 0.44) }}
    >
      {shop.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

type SearchResult = {
  products: { id: string; title: string; status: string }[];
  orders: { id: string; number: number; name: string; status: string }[];
  customers: { id: string; name: string; phone: string }[];
};

type CmdItem = { key: string; group: string; label: string; detail?: string; icon: typeof House; href: string };

function CommandBar({ open, onOpenChange, handle, nav }: { open: boolean; onOpenChange: (o: boolean) => void; handle: string; nav: NavItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);

  const setOpen = (o: boolean) => {
    if (!o) {
      setQ("");
      setRes(null);
      setActive(0);
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
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, handle]);

  const base = `/dashboard/${handle}`;
  const shown = q.trim().length < 2 ? null : res;
  const needle = q.trim().toLowerCase();
  const items: CmdItem[] = [
    ...(shown?.orders ?? []).map((o) => ({ key: `o${o.id}`, group: "Orders", label: `#${o.number}`, detail: o.name, icon: ShoppingBag, href: `${base}/orders/${o.id}` })),
    ...(shown?.products ?? []).map((p) => ({ key: `p${p.id}`, group: "Products", label: p.title, icon: Package, href: `${base}/products/${p.id}` })),
    ...(shown?.customers ?? []).map((c) => ({ key: `c${c.id}`, group: "Customers", label: c.name, detail: c.phone, icon: Users, href: `${base}/customers/${c.id}` })),
    ...[...nav, { href: `${base}/products/new`, label: "Add product", icon: Plus, group: "main" as const }]
      .filter((n) => !needle || n.label.toLowerCase().includes(needle))
      .map((n) => ({ key: `n${n.href}`, group: "Go to", label: n.label, icon: n.icon, href: n.href })),
  ];
  const sel = Math.min(active, Math.max(items.length - 1, 0));

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((sel + 1) % Math.max(items.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((sel - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter" && items[sel]) {
      e.preventDefault();
      go(items[sel].href);
    }
  };

  let lastGroup = "";
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Search" className="sm:top-[16%] sm:max-w-xl sm:translate-y-0">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Order number, product, customer name or phone"
          aria-label="Search"
          className="input pl-11"
        />
      </div>
      <div className="-mx-2 mt-3 max-h-[52vh] overflow-y-auto" role="listbox">
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <div key={it.key}>
              {header ? <p className="px-3 pb-1 pt-3 text-xs font-extrabold uppercase tracking-[0.06em] text-faint">{header}</p> : null}
              <button
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it.href)}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[15px]", i === sel ? "bg-sunken" : "")}
              >
                <it.icon size={16} className="shrink-0 text-mist" />
                <span className="min-w-0 truncate font-display font-semibold">{it.label}</span>
                {it.detail ? <span className="min-w-0 truncate text-mist">{it.detail}</span> : null}
                {i === sel ? <CornerDownLeft size={14} className="ml-auto shrink-0 text-faint" /> : null}
              </button>
            </div>
          );
        })}
        {!items.length ? <p className="px-3 py-6 text-center text-sm text-mist">Nothing matches “{q}”.</p> : null}
      </div>
    </Dialog>
  );
}
