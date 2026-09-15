"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
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
        <Store className="brand-mark" aria-hidden />
        {appName}
      </Link>
      <nav className="site-nav" aria-label="Primary">
        {!loading && user ? (
          <>
            <Link href="/inbox" className="site-nav-link">
              Inbox
            </Link>
            <Button asChild variant="primary" size="sm">
              <Link href="/dashboard">My shops</Link>
            </Button>
          </>
        ) : (
          <>
            <Link href="/dashboard" className="site-nav-link">
              Seller login
            </Link>
            <Button asChild variant="primary" size="sm">
              <Link href="/dashboard">Create your store</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
