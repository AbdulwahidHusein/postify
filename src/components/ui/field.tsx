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
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-danger">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
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

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2358615b'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

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
  /** "woven" adds the tibeb band: use for first-run moments, not for "no results". */
  tone?: "plain" | "woven";
  className?: string;
}) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      {tone === "woven" ? <div aria-hidden className="tibeb h-3.5" /> : null}
      <div className="flex flex-col items-center px-6 py-12 text-center">
        {icon ? <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink-soft">{icon}</div> : null}
        <h3 className="font-display text-[17px] font-semibold">{title}</h3>
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
            <p className="text-[13px] text-mist">{it.label}</p>
            <p className="num mt-1 font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-2xl">{it.value}</p>
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
      <p className="text-[13px] text-mist">{label}</p>
      <p className="num mt-1 font-display text-2xl font-semibold tracking-[-0.01em]">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-mist">{hint}</p> : null}
    </div>
  );
}
