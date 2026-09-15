"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  LayoutDashboard,
  MessageSquare,
  Package,
  Radio,
  Settings,
  ShoppingCart,
  Store,
} from "lucide-react";
import { appName } from "@/lib/env";
import { Button } from "@/components/ui/button";
import type { AdminShop } from "@/components/admin/types";

type IconType = typeof LayoutDashboard;

const SHOP_NAV: ReadonlyArray<{
  href: string;
  label: string;
  icon: IconType;
  exact: boolean;
}> = [
  { href: "", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/products", label: "Products", icon: Package, exact: false },
  { href: "/inbox", label: "Inbox", icon: MessageSquare, exact: false },
  { href: "/orders", label: "Orders", icon: ShoppingCart, exact: false },
  { href: "/channels", label: "Channels", icon: Radio, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
];

function ShopNavLinks({
  base,
  pathname,
  onNavigate,
}: {
  base: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {SHOP_NAV.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.exact
          ? pathname === base || pathname === `${base}/`
          : pathname.startsWith(href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href || "overview"}
            href={href}
            className={active ? "admin-nav-item is-active" : "admin-nav-item"}
            onClick={onNavigate}
          >
            <Icon className="admin-nav-icon" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function HamburgerButton({
  open,
  onClick,
  controlsId,
}: {
  open: boolean;
  onClick: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      className="admin-menu-btn"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onClick}
    >
      <span className={open ? "admin-burger is-open" : "admin-burger"} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

function useDrawer() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 960px)").matches) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { open, close, toggle, setOpen };
}

function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="admin-sidebar-brand">
      <Link
        href="/dashboard"
        className="admin-logo"
        onClick={onNavigate}
      >
        <Store className="admin-logo-mark" aria-hidden />
        {appName}
      </Link>
      <p className="admin-logo-sub">Seller console</p>
    </div>
  );
}

export function AdminShopShell({
  shop,
  children,
}: {
  shop: AdminShop;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const base = `/dashboard/s/${shop.slug}`;
  const drawer = useDrawer();
  const panelId = useId();

  return (
    <div className={drawer.open ? "admin-app is-drawer-open" : "admin-app"}>
      <button
        type="button"
        className="admin-drawer-backdrop"
        aria-label="Close menu"
        tabIndex={drawer.open ? 0 : -1}
        onClick={drawer.close}
      />

      <aside
        id={panelId}
        className="admin-sidebar"
        aria-label="Shop navigation"
      >
        <SidebarBrand onNavigate={drawer.close} />

        <div className="admin-sidebar-shop">
          <p className="admin-kicker">Shop</p>
          <p className="admin-shop-title">{shop.name}</p>
          <Link
            href={`/s/${shop.slug}`}
            className="admin-quiet-link"
            onClick={drawer.close}
          >
            Open storefront
          </Link>
        </div>

        <nav className="admin-nav" aria-label="Sections">
          <ShopNavLinks
            base={base}
            pathname={pathname}
            onNavigate={drawer.close}
          />
        </nav>

        <div className="admin-sidebar-foot">
          <Link
            href="/dashboard"
            className="admin-nav-item admin-nav-item--back"
            onClick={drawer.close}
          >
            <ChevronLeft className="admin-nav-icon" aria-hidden />
            <span>All shops</span>
          </Link>
        </div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <HamburgerButton
              open={drawer.open}
              onClick={drawer.toggle}
              controlsId={panelId}
            />
          </div>
          <div className="admin-topbar-right">
            <div className="admin-topbar-actions">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${shop.slug}`} target="_blank" rel="noopener noreferrer">
                  Storefront
                </Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href={`${base}/products/new`}>Add product</Link>
              </Button>
            </div>
            <span className="admin-topbar-shop">{shop.name}</span>
          </div>
        </header>

        <main className="admin-body">{children}</main>
      </div>
    </div>
  );
}

export function AdminHomeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const drawer = useDrawer();
  const panelId = useId();

  return (
    <div className={drawer.open ? "admin-app is-drawer-open" : "admin-app"}>
      <button
        type="button"
        className="admin-drawer-backdrop"
        aria-label="Close menu"
        tabIndex={drawer.open ? 0 : -1}
        onClick={drawer.close}
      />

      <aside
        id={panelId}
        className="admin-sidebar"
        aria-label="Console navigation"
      >
        <SidebarBrand onNavigate={drawer.close} />
        <nav className="admin-nav" aria-label="Sections">
          <Link
            href="/dashboard"
            className={
              pathname === "/dashboard"
                ? "admin-nav-item is-active"
                : "admin-nav-item"
            }
            onClick={drawer.close}
          >
            <LayoutDashboard className="admin-nav-icon" aria-hidden />
            <span>Shops</span>
          </Link>
          <Link href="/" className="admin-nav-item" onClick={drawer.close}>
            <Store className="admin-nav-icon" aria-hidden />
            <span>Marketing site</span>
          </Link>
        </nav>
        <div className="admin-sidebar-foot">
          <p className="admin-foot-note">
            Manage catalogs, channels, and listings from one place.
          </p>
        </div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <HamburgerButton
              open={drawer.open}
              onClick={drawer.toggle}
              controlsId={panelId}
            />
          </div>
          <div className="admin-topbar-right">
            <span className="admin-topbar-shop">Your shops</span>
          </div>
        </header>
        <main className="admin-body">{children}</main>
      </div>
    </div>
  );
}
