"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  init,
  isTMA,
  miniApp,
  themeParams,
  viewport,
  initData,
} from "@tma.js/sdk-react";
import { TelegramContextProvider } from "@/lib/telegram/context";
import type { TelegramRuntimeState, TelegramUser } from "@/lib/telegram/types";
import { measureChatBottomInset } from "@/lib/chat/bottom-inset";

function mapUser(): TelegramUser | null {
  const user = initData.user();
  if (!user) return null;

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    languageCode: user.language_code,
    isPremium: user.is_premium,
    photoUrl: user.photo_url,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function paintTelegramShell() {
  document.documentElement.dataset.platform = "tma";
  // Keep Goods light branding inside Mini App (ignore Telegram dark theme).
  const bg = "#f4f6f9";
  document.documentElement.style.background = bg;
  document.documentElement.style.backgroundColor = bg;
  document.body.style.background = bg;
  document.body.style.backgroundColor = bg;
  document.body.style.color = "";
  document.body.style.minHeight =
    "var(--tg-viewport-stable-height, 100dvh)";
  document.body.style.width = "100%";
}

async function bootTelegram(): Promise<Omit<TelegramRuntimeState, "ready">> {
  const syncInside = isTMA();
  const inside = syncInside
    ? true
    : await withTimeout(isTMA("complete"), 600, false);

  if (!inside) {
    return {
      isTma: false,
      user: null,
      startParam: null,
      rawInitData: null,
      error: null,
    };
  }

  paintTelegramShell();
  init();
  initData.restore();

  // Do not bind Telegram theme CSS vars — they force dark/black UI.
  if (themeParams.mount.isAvailable()) {
    themeParams.mount();
  }

  if (miniApp.mount.isAvailable()) {
    miniApp.mount();
    miniApp.setHeaderColor.ifAvailable("#f4f6f9");
    miniApp.setBgColor.ifAvailable("#f4f6f9");
  }

  if (viewport.mount.isAvailable()) {
    await viewport.mount();
    viewport.bindCssVars.ifAvailable();
    viewport.expand.ifAvailable();
  }

  // Publish bottom inset for docked UI from live device/Telegram measurements.
  const publishBottomInset = () => {
    try {
      document.documentElement.style.setProperty(
        "--chat-bottom-inset",
        `${measureChatBottomInset()}px`,
      );
    } catch {
      /* ignore */
    }
  };
  publishBottomInset();
  const tgApp = window.Telegram?.WebApp;
  const onInset = () => publishBottomInset();
  try {
    tgApp?.onEvent?.("safeAreaChanged", onInset);
    tgApp?.onEvent?.("contentSafeAreaChanged", onInset);
    tgApp?.requestSafeArea?.();
    tgApp?.requestContentSafeArea?.();
  } catch {
    /* ignore */
  }
  window.setTimeout(publishBottomInset, 50);
  window.setTimeout(publishBottomInset, 300);

  miniApp.ready.ifAvailable();
  paintTelegramShell();
  publishBottomInset();

  return {
    isTma: true,
    user: mapUser(),
    startParam: initData.startParam() ?? null,
    rawInitData: initData.raw() ?? null,
    error: null,
  };
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramRuntimeState>({
    isTma: false,
    ready: false,
    user: null,
    startParam: null,
    rawInitData: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    // Immediate paint if Telegram object already exists
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      paintTelegramShell();
    }

    bootTelegram()
      .then((next) => {
        if (cancelled) return;
        setState({ ...next, ready: true });
        if (next.isTma) {
          paintTelegramShell();
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          isTma: false,
          ready: true,
          user: null,
          startParam: null,
          rawInitData: null,
          error: err instanceof Error ? err.message : "Telegram init failed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TelegramContextProvider value={state}>{children}</TelegramContextProvider>
  );
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        themeParams?: Record<string, string>;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        disableVerticalSwipes?: () => void;
        safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
        contentSafeAreaInset?: {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        };
        requestSafeArea?: () => void;
        requestContentSafeArea?: () => void;
        onEvent?: (event: string, cb: () => void) => void;
        offEvent?: (event: string, cb: () => void) => void;
      };
    };
  }
}
