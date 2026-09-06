"use client";

import type { ReactNode } from "react";
import { TelegramProvider } from "@/components/providers/telegram-provider";
import { AuthProvider } from "@/components/providers/auth-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TelegramProvider>
      <AuthProvider>{children}</AuthProvider>
    </TelegramProvider>
  );
}
