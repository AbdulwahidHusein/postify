"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { appName } from "@/lib/env";

/**
 * Global header for marketing/home only.
 * Storefront (/s, /p) uses StorefrontNav with role-aware actions.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (pathname.startsWith("/dashboard")) return null;
  if (pathname.startsWith("/s/") || pathname.startsWith("/p/")) return null;
  if (pathname.startsWith("/inbox")) return null;

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        {appName}
      </Link>
      <nav className="site-nav" aria-label="Primary">
        {!loading && user ? (
          <>
            <Link href="/inbox">Inbox</Link>
            <Link href="/dashboard" className="site-nav-cta">
              My shops
            </Link>
          </>
        ) : (
          <>
            <Link href="/dashboard">Seller login</Link>
            <Link href="/dashboard" className="site-nav-cta">
              Create your store
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
