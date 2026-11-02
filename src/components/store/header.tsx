"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import { t, type Locale } from "@/i18n";
import { tc } from "@/i18n/catalog";
import { LangToggle } from "@/components/store/lang-toggle";
import { CartCount } from "@/components/store/cart-count";

export function StoreHeader({
  shop, base, locale, logoUrl, apiShop, menu = [],
}: { shop: { name: string }; base: string; locale: Locale; logoUrl: string | null; apiShop: string; menu?: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {menu.length ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={tc(locale, "store.nav.menu")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-ink md:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        ) : null}
        <Link href={base || "/"} className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-display text-base font-extrabold text-canvas">{shop.name.slice(0, 1)}</span>
          )}
          <span className="truncate font-display text-[17px] font-bold tracking-[-0.01em]">{shop.name}</span>
        </Link>
        {menu.length ? (
          <nav aria-label={shop.name} className="ml-6 hidden items-center gap-1 md:flex">
            {menu.map((m) => (
              <Link key={m.label + m.href} href={m.href} className="rounded-full px-3 py-2 font-display text-[14px] font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink">{m.label}</Link>
            ))}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <LangToggle locale={locale} />
          <Link href={`${base}/cart`} className="relative grid h-11 w-11 place-items-center rounded-full bg-surface text-ink transition-colors hover:bg-sunken" aria-label={t(locale, "nav.cart")}>
            <ShoppingBag size={20} />
            <CartCount shop={apiShop} />
          </Link>
        </div>
      </div>
      {open && menu.length ? (
        <nav aria-label={shop.name} className="mx-auto max-w-6xl animate-fade-in px-4 pb-3 md:hidden">
          <div className="rounded-[var(--store-card,20px)] bg-surface p-2">
            {menu.map((m) => (
              <Link key={m.label + m.href} href={m.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-[14px] px-3 font-display text-[16px] font-bold hover:bg-sunken">{m.label}</Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
