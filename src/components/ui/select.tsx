"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: React.ReactNode; disabled?: boolean };

function readOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      out.push({ value: String(el.props.value ?? el.props.children ?? ""), label: el.props.children, disabled: el.props.disabled });
    } else if (el.props.children) {
      out.push(...readOptions(el.props.children));
    }
  });
  return out;
}

/**
 * A styled listbox that keeps the native <select> API: pass <option>
 * children and read e.target.value in onChange. Opens a popover with
 * the current choice checked; full keyboard support (arrows, Home/End,
 * type-to-find, Enter/Space, Escape).
 */
export function Select({
  value,
  defaultValue,
  onChange,
  children,
  className,
  disabled,
  name,
  id,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const [inner, setInner] = React.useState(String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = React.useState(false);
  const [up, setUp] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const typed = React.useRef({ text: "", at: 0 });
  const listId = React.useId();

  const choose = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    trigger.current?.focus();
  };

  const show = () => {
    if (disabled) return;
    const r = trigger.current?.getBoundingClientRect();
    setUp(!!r && window.innerHeight - r.bottom < Math.min(320, options.length * 46 + 24) && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const move = (to: number) => {
    const n = options.length;
    for (let i = 0; i < n; i++) {
      const idx = (to + i + n) % n;
      if (!options[idx].disabled) return setActive(idx);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); move(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[active]; if (o && !o.disabled) choose(o.value); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => String(typeof o.label === "string" ? o.label : o.value).toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div ref={root} className="relative min-w-0">
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={rest["aria-label"]}
        aria-labelledby={rest["aria-labelledby"]}
        aria-describedby={rest["aria-describedby"]}
        aria-invalid={rest["aria-invalid"]}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cn("input flex items-center gap-2 text-left", open && "border-ink bg-surface shadow-[0_3px_0_var(--accent)]", className)}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown size={18} strokeWidth={2.4} aria-hidden className={cn("shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className={cn(
            "absolute left-0 z-50 max-h-80 min-w-full animate-fade-in overflow-y-auto rounded-[20px] bg-surface p-1.5 shadow-pop",
            up ? "bottom-full mb-3" : "top-full mt-2",
          )}
        >
          {options.map((o, i) => {
            const on = o.value === current;
            return (
              <li
                key={o.value + i}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !o.disabled && choose(o.value)}
                className={cn(
                  "flex min-h-11 cursor-pointer select-none items-center gap-3 whitespace-nowrap rounded-[14px] px-3 font-display text-[15px] font-semibold transition-colors",
                  on ? "bg-accent text-accent-fg" : i === active ? "bg-sunken text-ink" : "text-ink",
                  o.disabled && "cursor-not-allowed opacity-45",
                )}
              >
                <span className="flex-1">{o.label}</span>
                {on ? <Check size={17} strokeWidth={3} aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
