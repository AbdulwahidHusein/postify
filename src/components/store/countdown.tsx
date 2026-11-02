"use client";

import { useEffect, useState } from "react";

/** Live days/hours/minutes to a deadline. Renders nothing once it has passed. */
export function Countdown({ endsAt, labels }: { endsAt: string; labels: { endsIn: string; days: string; hours: string; mins: string } }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const left = Math.max(0, end - (now ?? end - 1));
  if (now !== null && left <= 0) return null;
  const d = Math.floor(left / 864e5);
  const h = Math.floor((left % 864e5) / 36e5);
  const m = Math.floor((left % 36e5) / 6e4);
  const cell = (n: number, label: string) => (
    <span className="flex min-w-[64px] flex-col items-center rounded-[var(--store-card,18px)] bg-black/15 px-3 py-2">
      <b className="num font-display text-2xl font-extrabold leading-none">{now === null ? "--" : String(n).padStart(2, "0")}</b>
      <span className="mt-1 text-[11px] font-bold opacity-80">{label}</span>
    </span>
  );
  return (
    <div aria-label={labels.endsIn} className="flex items-center gap-2">
      {cell(d, labels.days)}
      {cell(h, labels.hours)}
      {cell(m, labels.mins)}
    </div>
  );
}
