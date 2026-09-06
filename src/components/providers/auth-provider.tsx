"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTelegram } from "@/lib/telegram/context";

export type AuthUser = {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  isPremium: boolean;
  photoUrl: string | null;
  createdAt: string;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loginWithInitData: (initData: string) => Promise<void>;
  loginWithWidget: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Server returned non-JSON (tunnel/interstitial?). Restart tunnel."
        : `Request failed (${res.status})`,
    );
  }
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "error" in data && data.error
        ? String(data.error)
        : `Request failed (${res.status})`,
    );
  }
  return data;
}

async function apiFetch(input: string, init: RequestInit = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        "ngrok-skip-browser-warning": "1",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isTma, ready: tmaReady, rawInitData } = useTelegram();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const miniAppTriedRef = useRef(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await readJson<{ user: AuthUser | null }>(
      await apiFetch("/api/auth/me"),
    );
    if (mountedRef.current) setUser(data.user);
  }, []);

  const loginWithInitData = useCallback(async (initDataRaw: string) => {
    const data = await readJson<{ user: AuthUser }>(
      await apiFetch("/api/auth/telegram-miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initDataRaw }),
      }),
    );
    if (mountedRef.current) {
      setUser(data.user);
      setError(null);
    }
  }, []);

  const loginWithWidget = useCallback(
    async (payload: Record<string, unknown>) => {
      const data = await readJson<{ user: AuthUser }>(
        await apiFetch("/api/auth/telegram-widget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      if (mountedRef.current) {
        setUser(data.user);
        setError(null);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await readJson(await apiFetch("/api/auth/logout", { method: "POST" }));
    if (mountedRef.current) setUser(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const safety = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    void (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.name === "AbortError"
              ? "Could not reach the server. Check the tunnel is running."
              : err instanceof Error
                ? err.message
                : "Auth failed";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(safety);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearTimeout(safety);
    };
  }, [refresh]);

  useEffect(() => {
    if (!tmaReady || !isTma || miniAppTriedRef.current || user || !rawInitData) {
      return;
    }

    miniAppTriedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        await loginWithInitData(rawInitData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Mini App login failed",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tmaReady, isTma, user, rawInitData, loginWithInitData]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      refresh,
      loginWithInitData,
      loginWithWidget,
      logout,
    }),
    [
      user,
      loading,
      error,
      refresh,
      loginWithInitData,
      loginWithWidget,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
