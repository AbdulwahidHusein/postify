"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTelegram } from "@/lib/telegram/context";
import { buttonVariants } from "@/components/ui/button";

export function LoginPanel({ next, bot, botLink, error }: { next: string; bot: string; botLink: string; error: string | null }) {
  const router = useRouter();
  const { user, loading, loginWithWidget, error: authError } = useAuth();
  const { isTma } = useTelegram();
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  // Telegram Login Widget (works only on the domain registered with the bot).
  useEffect(() => {
    if (isTma || !bot || !widgetRef.current || widgetRef.current.childElementCount) return;
    (window as unknown as { onTelegramAuth: (u: Record<string, unknown>) => void }).onTelegramAuth = (u) => {
      void loginWithWidget(u);
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    widgetRef.current.appendChild(s);
  }, [isTma, bot, loginWithWidget]);

  if (isTma || loading) {
    return <p className="text-center text-mist">Signing you in with Telegram…</p>;
  }
  return (
    <div className="text-center">
      <h1 className="font-display text-[22px] font-bold">Sign in to Goods</h1>
      <p className="mt-2 text-sm text-mist">Goods uses your Telegram account. No passwords.</p>
      {error || authError ? <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error === "expired" ? "That sign-in link expired. Try again." : authError ?? "Sign-in failed. Try again."}</p> : null}
      <div ref={widgetRef} className="mt-8 flex min-h-12 justify-center" />
      <div className="my-6 flex items-center gap-3 text-xs text-mist"><span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" /></div>
      <a href={botLink} className={buttonVariants({ variant: "telegram", fullWidth: true, size: "lg" })}>
        <Send size={18} /> Sign in with the Telegram app
      </a>
      <p className="mt-3 text-xs text-mist">Opens the Goods bot, which sends you a one-time sign-in button.</p>
    </div>
  );
}
