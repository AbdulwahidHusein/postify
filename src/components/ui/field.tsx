import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const note = error ? <p role="alert" className="mt-1.5 text-[13px] font-bold text-danger">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null;
  // Without an id to point at, wrap the control so the label still names it.
  if (label && !htmlFor) {
    return (
      <div className={cn("min-w-0", className)}>
        <label className="block">
          <span className="field-label">{label}</span>
          {children}
        </label>
        {note}
      </div>
    );
  }
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
      ) : null}
      {children}
      {note}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("input", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("textarea", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export { Select } from "./select";

export function EmptyState({
  icon,
  title,
  body,
  action,
  tone = "plain",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  /** "woven" adds an accent band on top: use for first-run moments, not for "no results". */
  tone?: "plain" | "woven";
  className?: string;
}) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      {tone === "woven" ? <div aria-hidden className="h-2 bg-accent" /> : null}
      <div className="flex flex-col items-center px-6 py-12 text-center">
        {icon ? <div className="mb-4 grid h-14 w-14 place-items-center rounded-[20px] bg-brand-soft text-brand-ink">{icon}</div> : null}
        <h3 className="font-display text-xl font-extrabold tracking-[-0.02em]">{title}</h3>
        {body ? <p className="mt-1.5 max-w-sm text-sm text-mist">{body}</p> : null}
        {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** One row of metrics inside a single panel, separated by rules (not a card per number). */
export function StatStrip({ items, className }: { items: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }[]; className?: string }) {
  return (
    <div className={cn("panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*:nth-child(-n+2)]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-line sm:[&>*:nth-child(odd)]:border-r-0", className)}>
      {items.map((it) => {
        const inner = (
          <>
            <p className="text-[13px] font-bold text-mist">{it.label}</p>
            <p className="num mt-1 font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">{it.value}</p>
            {it.hint ? <p className="mt-0.5 text-xs text-mist">{it.hint}</p> : null}
          </>
        );
        return it.href ? (
          <a key={it.label} href={it.href} className="block px-4 py-3.5 transition-colors hover:bg-canvas sm:px-5 sm:py-4">{inner}</a>
        ) : (
          <div key={it.label} className="px-4 py-3.5 sm:px-5 sm:py-4">{inner}</div>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="text-[13px] font-bold text-mist">{label}</p>
      <p className="num mt-1 font-display text-[28px] font-extrabold tracking-[-0.03em]">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-mist">{hint}</p> : null}
    </div>
  );
}
