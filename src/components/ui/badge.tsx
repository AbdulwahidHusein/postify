import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-signal/12 text-signal",
        neutral:
          "border-line bg-paper-muted text-ink",
        success:
          "border-transparent bg-emerald-500/12 text-emerald-700",
        warning:
          "border-transparent bg-amber-500/14 text-amber-700",
        danger:
          "border-transparent bg-danger/12 text-danger",
        outline: "border-line-strong text-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
