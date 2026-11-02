import Link from "next/link";
import { cn } from "@/lib/utils";

export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-1 rounded-xl bg-paper-muted p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === active ? "bg-surface text-ink shadow-sm" : "text-mist hover:text-ink",
            )}
          >
            {t.label}
            {t.count ? <span className="ml-1.5 tabular-nums text-mist">{t.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SearchBox({ action, defaultValue, placeholder, hidden }: { action: string; defaultValue?: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="mb-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name="q" defaultValue={defaultValue} placeholder={placeholder} className="input" />
    </form>
  );
}
