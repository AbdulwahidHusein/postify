"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type Kind = "brand" | "model";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  category: string;
  kind: Kind;
  /** Required when kind=model */
  brand?: string;
  /** Inline options when the list fits in the initial payload */
  options: string[];
  /** True when server capped the list — use remote typeahead */
  truncated?: boolean;
  /** Total catalog size when truncated (for helper text) */
  totalCount?: number;
  disabled?: boolean;
  placeholder?: string;
};

function filterLocal(options: string[], q: string, limit = 50): string[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return options.slice(0, limit);
  const starts: string[] = [];
  const includes: string[] = [];
  for (const opt of options) {
    const lower = opt.toLowerCase();
    if (lower.startsWith(trimmed)) starts.push(opt);
    else if (lower.includes(trimmed)) includes.push(opt);
    if (starts.length + includes.length >= limit) break;
  }
  return [...starts, ...includes].slice(0, limit);
}

/**
 * Cascading Brand/Model combobox.
 * Prefers filtering the already-fetched options list; only hits the suggest
 * API when the server marked the payload as truncated.
 */
export function CatalogTypeahead({
  label,
  value,
  onChange,
  category,
  kind,
  brand = "",
  options,
  truncated = false,
  totalCount,
  disabled,
  placeholder,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const useRemote = truncated;

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !useRemote || !category.trim()) {
      setRemoteOptions([]);
      return;
    }
    if (kind === "model" && !brand.trim()) {
      setRemoteOptions([]);
      return;
    }

    const searchQ = query.trim();
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            category,
            kind,
            q: searchQ,
            limit: "50",
          });
          if (kind === "model") params.set("brand", brand);
          const res = await fetch(`/api/catalog/form-fields?${params}`, {
            signal: ctrl.signal,
            cache: "no-store",
          });
          const data = (await res.json()) as { suggestions?: string[] };
          setRemoteOptions(data.suggestions ?? []);
        } catch {
          /* ignore abort / network */
        }
      })();
    }, 150);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [open, useRemote, category, kind, brand, query]);

  const results = useRemote
    ? remoteOptions
    : filterLocal(options, open ? query : value);

  const catalogSize = totalCount ?? options.length;
  const helper = useMemo(() => {
    if (!open) return null;
    if (kind === "model" && !brand.trim()) return "Pick a brand first";
    if (!catalogSize) {
      return `No ${label.toLowerCase()} list yet — type a custom value`;
    }
    if (useRemote) {
      return `${catalogSize.toLocaleString()} available — keep typing`;
    }
    if (!query.trim() && catalogSize > 40) {
      const example = kind === "brand" ? "Toyota" : "Corolla";
      return `${catalogSize.toLocaleString()} available — try “${example}”`;
    }
    return null;
  }, [open, kind, brand, catalogSize, label, useRemote, query]);

  function select(next: string) {
    onChange(next);
    setQuery(next);
    setHint(null);
    setOpen(false);
  }

  async function maybeSuggestCanonical(raw: string) {
    if (!raw.trim() || !category.trim()) {
      setHint(null);
      return;
    }
    if (options.includes(raw) || remoteOptions.includes(raw)) {
      setHint(null);
      return;
    }
    try {
      const body =
        kind === "brand"
          ? { category, brand: raw }
          : { category, brand, model: raw };
      const res = await fetch("/api/catalog/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = (await res.json()) as {
        brand?: string | null;
        model?: string | null;
        scores?: { brand?: number; model?: number };
      };
      const canonical = kind === "brand" ? data.brand : data.model;
      const score =
        kind === "brand" ? data.scores?.brand ?? 0 : data.scores?.model ?? 0;
      if (canonical && canonical !== raw && score >= 0.7) {
        setHint(canonical);
      } else {
        setHint(null);
      }
    } catch {
      setHint(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setQuery(value);
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) select(pick);
      else {
        onChange(query);
        setOpen(false);
        void maybeSuggestCanonical(query);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
    }
  }

  const inputValue = open ? query : value;
  const emptyMessage =
    kind === "model" && !brand.trim()
      ? "Pick a brand first"
      : useRemote
        ? "Type to search…"
        : "No matches — keep typing a custom value";

  return (
    <div className="combo" ref={rootRef}>
      <label className="admin-field">
        <span>{label}</span>
        <div className="combo-input-wrap">
          <input
            className="field"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            disabled={disabled}
            value={inputValue}
            placeholder={placeholder ?? `Type to search ${label.toLowerCase()}…`}
            maxLength={120}
            onFocus={() => {
              setQuery(value);
              setOpen(true);
              setHighlight(0);
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              onChange(next);
              setHint(null);
              setOpen(true);
              setHighlight(0);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                void maybeSuggestCanonical(value);
              }, 180);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="combo-toggle"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`Browse ${label}`}
            onClick={() => {
              if (!open) setQuery(value);
              setOpen((o) => !o);
            }}
          >
            ▾
          </button>
        </div>
      </label>

      {helper ? <p className="combo-hint">{helper}</p> : null}

      {hint ? (
        <p className="combo-hint">
          Did you mean{" "}
          <button
            type="button"
            className="combo-hint-link"
            onClick={() => select(hint)}
          >
            {hint}
          </button>
          ?
        </p>
      ) : null}

      {open ? (
        <div id={listId} className="combo-menu" role="listbox">
          {results.length === 0 ? (
            <p className="combo-empty">{emptyMessage}</p>
          ) : (
            results.map((opt, idx) => {
              const active = idx === highlight;
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={value === opt}
                  className={
                    active ? "combo-option is-active" : "combo-option"
                  }
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(opt)}
                >
                  {opt}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
