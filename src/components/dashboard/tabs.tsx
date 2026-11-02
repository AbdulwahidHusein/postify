import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Underline tabs: filters that belong to the table below them. */
export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex w-max min-w-full gap-5 border-b border-line">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={on}
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
                on ? "border-ink text-ink" : "border-transparent text-mist hover:text-ink",
              )}
            >
              {t.label}
              {t.count ? (
                <span className={cn("num rounded-full px-1.5 text-xs font-semibold", on ? "bg-ink text-white" : "bg-sunken text-ink-soft")}>{t.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SearchBox({ action, defaultValue, placeholder, hidden }: { action: string; defaultValue?: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} role="search" className="relative">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label={placeholder} className="input pl-9" />
    </form>
  );
}
