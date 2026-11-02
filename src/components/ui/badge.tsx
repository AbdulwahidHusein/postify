import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status pills. A leading dot carries the tone so the label can stay
 * neutral and readable; color never carries meaning on its own.
 */
const badgeVariants = cva(
  "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-display text-[12.5px] font-bold leading-none",
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand-ink",
        neutral: "bg-sunken text-ink-soft",
        success: "bg-success-soft text-success",
        warning: "bg-adey-soft text-adey-ink",
        danger: "bg-danger-soft text-danger",
        info: "bg-telegram-soft text-[#0d5f87]",
        outline: "border-2 border-line-strong bg-surface text-ink-soft",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const DOT: Record<string, string> = {
  default: "bg-brand",
  neutral: "bg-faint",
  success: "bg-success-dot",
  warning: "bg-adey",
  danger: "bg-danger",
  info: "bg-telegram",
  outline: "bg-faint",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[variant ?? "default"])} /> : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
