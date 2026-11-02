import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Coral buttons: pill shaped, Rubik bold. Primary sits on a hard ink
 * shadow that lifts on hover and presses flat on tap, so every tap feels
 * physical. Touch targets are at least 44px from md up.
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-display font-bold tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-[0_3px_0_var(--ink)] hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_4px_0_var(--ink)] active:translate-y-[3px] active:shadow-[0_0_0_var(--ink)]",
        ink: "bg-ink text-white hover:bg-ink-soft active:scale-[0.98]",
        secondary: "border-2 border-ink bg-surface text-ink hover:bg-canvas active:scale-[0.98]",
        outline: "border-2 border-line-strong bg-transparent text-ink hover:border-ink active:scale-[0.98]",
        ghost: "text-ink-soft hover:bg-sunken hover:text-ink active:scale-[0.98]",
        danger: "bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--danger-soft)_80%,var(--danger))] active:scale-[0.98]",
        "danger-solid": "bg-danger text-white hover:bg-danger/90 active:scale-[0.98]",
        telegram: "bg-telegram text-white hover:bg-telegram/90 active:scale-[0.98]",
        link: "h-auto px-0 font-bold text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-full px-3.5 text-[13px]",
        md: "h-11 rounded-full px-5 text-[15px]",
        lg: "h-[52px] rounded-full px-6 text-base",
        icon: "h-11 w-11 rounded-full",
        "icon-sm": "h-9 w-9 rounded-full",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, fullWidth, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
