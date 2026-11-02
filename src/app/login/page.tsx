import { LoginPanel } from "@/components/auth/login-panel";
import { botUsername } from "@/server/env";
import { botStartLink } from "@/server/services/telegram";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/dashboard";
  const payload = next.startsWith("/inbox") ? "auth_inbox" : next.startsWith("/account") ? "auth_orders" : "auth";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <LoginPanel next={next} bot={botUsername()} botLink={botStartLink(payload)} error={sp.error ?? null} />
    </main>
  );
}
