"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { TelegramRuntimeState } from "@/lib/telegram/types";

const defaultState: TelegramRuntimeState = {
  isTma: false,
  ready: false,
  user: null,
  startParam: null,
  rawInitData: null,
  error: null,
};

const TelegramContext = createContext<TelegramRuntimeState>(defaultState);

export function TelegramContextProvider({
  value,
  children,
}: {
  value: TelegramRuntimeState;
  children: ReactNode;
}) {
  const memo = useMemo(() => value, [value]);
  return (
    <TelegramContext.Provider value={memo}>{children}</TelegramContext.Provider>
  );
}

export function useTelegram() {
  return useContext(TelegramContext);
}

export function useIsTma() {
  return useTelegram().isTma;
}
