"use client";

import { useEffect, useId, useRef, useState } from "react";

const LOCAL_CAP = 200;

type Kind = "brand" | "model";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  category: string;
  kind: Kind;
  /** Required when kind=model */
  brand?: string;
  /** Inline options when the list is small enough */
  options: string[];
  /** True when server capped the list — force remote typeahead */
  truncated?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

function filterLocal(options: string[], q: string, limit = 40): string[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return options.slice(0, limit);
  const out: string[] = [];
  for (const opt of options) {
    if (opt.toLowerCase().includes(trimmed)) {
      out.push(opt);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Cascading Brand/Model combobox. Uses local filter for small lists;
 * debounced remote suggest when the catalog scope is large/truncated.
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
  const useRemote =
    truncated || options.length > LOCAL_CAP || (kind === "model" && truncated);

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
            limit: "40",
          });
          if (kind === "model") params.set("brand", brand);
          const res = await fetch(`/api/catalog/form-fields?${params}`, {
            signal: ctrl.signal,
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
    // Skip if already an exact option hit
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
      });
      const data = (await res.json()) as {
        brand?: string | null;
        model?: string | null;
        scores?: { brand?: number; model?: number };
      };
      const canonical = kind === "brand" ? data.brand : data.model;
      const score =
        kind === "brand" ? data.scores?.brand ?? 0 : data.scores?.model ?? 0;
      if (
        canonical &&
        canonical !== raw &&
        score >= 0.7
      ) {
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
            placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
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
              // Delay so option click can fire first
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
