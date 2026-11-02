import Link from "next/link";
import { GoodsLogo } from "@/components/brand";
import { LoginPanel } from "@/components/auth/login-panel";
import { botUsername } from "@/server/env";
import { botStartLink } from "@/server/services/telegram";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/dashboard";
  const payload = next.startsWith("/inbox") ? "auth_inbox" : next.startsWith("/account") ? "auth_orders" : "auth";
  return (
    <div className="flex min-h-dvh flex-col">
      <div aria-hidden className="tibeb h-3.5" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
        <Link href="/" className="mx-auto mb-8"><GoodsLogo size={28} /></Link>
        <div className="rounded-[20px] bg-surface p-6 ring-1 ring-line sm:p-8">
          <LoginPanel next={next} bot={botUsername()} botLink={botStartLink(payload)} error={sp.error ?? null} />
        </div>
      </main>
    </div>
  );
}
