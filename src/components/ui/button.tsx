import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-signal text-accent-fg shadow-sm hover:bg-signal/90",
        secondary:
          "bg-paper-muted text-ink border border-line hover:bg-paper-muted/70",
        outline:
          "border border-line-strong text-ink bg-transparent hover:bg-paper-muted",
        ghost: "text-ink hover:bg-paper-muted",
        danger:
          "text-danger border border-danger/30 bg-transparent hover:bg-danger/10",
        link: "text-signal underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-lg px-3 text-sm",
        md: "h-10 rounded-lg px-4 text-sm",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-10 w-10 rounded-lg",
        "icon-sm": "h-9 w-9 rounded-lg",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
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
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
