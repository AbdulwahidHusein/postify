"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTelegram } from "@/lib/telegram/context";

/** Mini App opened at the root: follow the start parameter, else the dashboard. */
export function MiniAppEntry() {
  const router = useRouter();
  const { isTma, ready, startParam } = useTelegram();
  useEffect(() => {
    if (!ready || !isTma) return;
    if (startParam && /^[A-Za-z0-9_-]{1,512}$/.test(startParam)) router.replace(`/go/${startParam}`);
    else router.replace("/dashboard");
  }, [ready, isTma, startParam, router]);
  return null;
}
