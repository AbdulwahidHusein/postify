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
import { appName } from "@/lib/env";
import type { AdminShop } from "@/components/admin/types";

const SHOP_NAV = [
  { href: "", label: "Overview", exact: true },
  { href: "/products", label: "Products", exact: false },
  { href: "/channels", label: "Channels", exact: false },
  { href: "/settings", label: "Settings", exact: false },
] as const;

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
        return (
          <Link
            key={item.href || "overview"}
            href={href}
            className={active ? "admin-nav-item is-active" : "admin-nav-item"}
            onClick={onNavigate}
          >
            {item.label}
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
        <div className="admin-sidebar-brand">
          <Link
            href="/dashboard"
            className="admin-logo"
            onClick={drawer.close}
          >
            {appName}
          </Link>
          <p className="admin-logo-sub">Seller console</p>
        </div>

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
            className="admin-nav-item"
            onClick={drawer.close}
          >
            All shops
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
            <div className="admin-topbar-titles">
              <span className="admin-topbar-shop">{shop.name}</span>
              <span className="admin-topbar-crumb">Manage</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Link href={`/s/${shop.slug}`} className="btn btn-ghost btn-sm">
              Storefront
            </Link>
            <Link
              href={`${base}/products/new`}
              className="btn btn-primary btn-sm"
            >
              Add product
            </Link>
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
        <div className="admin-sidebar-brand">
          <Link
            href="/dashboard"
            className="admin-logo"
            onClick={drawer.close}
          >
            {appName}
          </Link>
          <p className="admin-logo-sub">Seller console</p>
        </div>
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
            Shops
          </Link>
          <Link href="/" className="admin-nav-item" onClick={drawer.close}>
            Marketing site
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
            <div className="admin-topbar-titles">
              <span className="admin-topbar-shop">Your shops</span>
              <span className="admin-topbar-crumb">Workspace</span>
            </div>
          </div>
        </header>
        <main className="admin-body">{children}</main>
      </div>
    </div>
  );
}
