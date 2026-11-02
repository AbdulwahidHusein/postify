"use client";

import type { ReactNode } from "react";
import { TelegramProvider } from "@/components/providers/telegram-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ToastProvider } from "@/components/ui/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TelegramProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </TelegramProvider>
  );
}
