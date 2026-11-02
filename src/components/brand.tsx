import { cn } from "@/lib/utils";

/**
 * The Goods mark: a chat bubble with a "g" inside, because every Goods
 * sale starts as a conversation in Telegram.
 */
export function GoodsMark({ size = 24, className, tone = "ink" }: { size?: number; className?: string; tone?: "ink" | "coral" }) {
  const bubble = tone === "ink" ? "var(--ink)" : "var(--brand)";
  const glyph = tone === "ink" ? "var(--brand)" : "var(--ink)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <path d="M14 8h36a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H30l-12 10v-10h-4A10 10 0 0 1 4 38V18A10 10 0 0 1 14 8z" fill={bubble} />
      <circle cx="32" cy="28" r="9" fill="none" stroke={glyph} strokeWidth="5" />
      <path d="M41 22v12a9 9 0 0 1-9 9" fill="none" stroke={glyph} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function GoodsLogo({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <GoodsMark size={size} />
      <span className="font-display text-[22px] font-extrabold leading-none tracking-[-0.05em] text-ink">goods</span>
    </span>
  );
}
