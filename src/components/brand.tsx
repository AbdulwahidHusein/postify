import { cn } from "@/lib/utils";

/** The Goods mark: one diamond from the tibeb weave. */
export function GoodsMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
      <rect width="24" height="24" rx="7" fill="var(--brand)" />
      <path d="M12 4.5 19.5 12 12 19.5 4.5 12z" fill="var(--adey)" />
      <path d="M12 9l3 3-3 3-3-3z" fill="#fff" />
    </svg>
  );
}

export function GoodsLogo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <GoodsMark size={size} />
      <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink">Goods</span>
    </span>
  );
}
