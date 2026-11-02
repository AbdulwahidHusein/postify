import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-accent-hover",
        secondary: "border border-line-strong bg-surface text-ink shadow-[0_1px_0_rgb(22_32_27/0.04)] hover:border-faint hover:bg-canvas",
        outline: "border border-line-strong bg-transparent text-ink hover:bg-sunken",
        ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
        danger: "border border-line-strong bg-surface text-danger hover:border-danger/40 hover:bg-danger-soft",
        "danger-solid": "bg-danger text-white hover:bg-danger/90",
        telegram: "bg-telegram text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)] hover:bg-telegram/90",
        link: "h-auto px-0 font-medium text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-[8px] px-3 text-[13px]",
        md: "h-10 rounded-[var(--radius-control)] px-4 text-sm",
        lg: "h-12 rounded-[12px] px-5 text-[15px]",
        icon: "h-10 w-10 rounded-[var(--radius-control)]",
        "icon-sm": "h-8 w-8 rounded-[8px]",
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
