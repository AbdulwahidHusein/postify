"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export type TrendPoint = { day: string; value: number; secondary?: number };

const fmtDay = (d: string, long = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });

/**
 * Area trend for one metric, optional bars for a second (e.g. sales + orders).
 * Pointer and keyboard both move the readout; the figure has a text summary.
 */
export function TrendChart({
  points,
  kind,
  currency = "ETB",
  secondaryLabel,
  height = 180,
  className,
  summary,
}: {
  points: TrendPoint[];
  /** "money" values are minor units (santim). */
  kind: "money" | "count";
  currency?: string;
  secondaryLabel?: string;
  height?: number;
  className?: string;
  summary: string;
}) {
  const format = (v: number) => (kind === "money" ? (formatMoney(BigInt(Math.round(v)), currency) ?? `${currency} 0`) : v.toLocaleString("en-US"));
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padTop = 12;
  const padBottom = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const maxSecondary = Math.max(1, ...points.map((p) => p.secondary ?? 0));
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);

  const path = useMemo(() => {
    if (!n) return { line: "", area: "" };
    // Monotone-ish smoothing with short cubic handles.
    let line = `M ${x(0)} ${y(points[0].value)}`;
    for (let i = 1; i < n; i += 1) {
      const x0 = x(i - 1);
      const x1 = x(i);
      const dx = (x1 - x0) * 0.4;
      line += ` C ${x0 + dx} ${y(points[i - 1].value)}, ${x1 - dx} ${y(points[i].value)}, ${x1} ${y(points[i].value)}`;
    }
    const area = `${line} L ${x(n - 1)} ${H - padBottom} L ${x(0)} ${H - padBottom} Z`;
    return { line, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, H]);

  const active = hover ?? n - 1;
  const p = points[active];
  const ticks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const barW = Math.max(2, Math.min(14, (W / Math.max(n, 1)) * 0.38));

  return (
    <figure className={cn("relative", className)}>
      <figcaption className="sr-only">{summary}</figcaption>
      {p ? (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5" aria-live="polite">
          <span className="num font-display text-[22px] font-semibold tracking-[-0.01em]">{format(p.value)}</span>
          {secondaryLabel && p.secondary !== undefined ? (
            <span className="num text-sm text-mist">{p.secondary} {p.secondary === 1 ? secondaryLabel.replace(/s$/, "") : secondaryLabel}</span>
          ) : null}
          <span className="text-sm text-mist">{fmtDay(p.day, true)}</span>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-auto w-full touch-pan-y overflow-visible outline-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        tabIndex={0}
        role="img"
        aria-label={summary}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover(Math.max(0, active - 1));
          if (e.key === "ArrowRight") setHover(Math.min(n - 1, active + 1));
        }}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={padTop + f * (H - padTop - padBottom)} y2={padTop + f * (H - padTop - padBottom)} stroke="var(--line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" x2={W} y1={H - padBottom} y2={H - padBottom} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
        {secondaryLabel
          ? points.map((pt, i) =>
              pt.secondary ? (
                <rect
                  key={pt.day}
                  x={x(i) - barW / 2}
                  width={barW}
                  y={H - padBottom - ((pt.secondary / maxSecondary) * (H - padTop - padBottom)) * 0.45}
                  height={((pt.secondary / maxSecondary) * (H - padTop - padBottom)) * 0.45}
                  rx="2"
                  fill="var(--adey)"
                  opacity={i === active ? 1 : 0.55}
                />
              ) : null,
            )
          : null}
        <path d={path.area} fill={`url(#g${id})`} />
        <path d={path.line} fill="none" stroke="var(--brand)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {p ? (
          <>
            <line x1={x(active)} x2={x(active)} y1={padTop - 6} y2={H - padBottom} stroke="var(--ink)" strokeOpacity="0.18" vectorEffect="non-scaling-stroke" />
            <circle cx={x(active)} cy={y(p.value)} r="4.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint">
        {ticks.map((i) => (
          <span key={i}>{points[i] ? fmtDay(points[i].day) : ""}</span>
        ))}
      </div>
    </figure>
  );
}
