"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appName } from "@/lib/env";

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard")) return null;

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        {appName}
      </Link>
      <nav className="site-nav" aria-label="Primary">
        <Link href="/dashboard">Dashboard</Link>
      </nav>
    </header>
  );
}
