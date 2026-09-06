"use client";

import { useEffect, useRef } from "react";
import { telegramBotUsername } from "@/lib/env";
import { useAuth } from "@/components/providers/auth-provider";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

type Props = {
  onError?: (message: string) => void;
};

export function TelegramLoginButton({ onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loginWithWidget } = useAuth();

  useEffect(() => {
    if (!telegramBotUsername || !containerRef.current) return;

    window.onTelegramAuth = async (user) => {
      try {
        await loginWithWidget(user);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Login failed");
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [loginWithWidget, onError]);

  if (!telegramBotUsername) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        Set <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> and{" "}
        <code>TELEGRAM_BOT_TOKEN</code> in <code>.env.local</code>, then add
        your domain in @BotFather → Bot Settings → Domain.
      </p>
    );
  }

  return <div ref={containerRef} />;
}
