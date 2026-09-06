"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ALL_CATEGORIES,
  CATEGORY_GROUPS,
  searchCategories,
} from "@/lib/catalog/categories";

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

export function CategoriesMultiSelect({ value, onChange, disabled }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of value) {
      const t = item.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [value]);

  const results = useMemo(() => {
    const hits = searchCategories(query, 40);
    return hits.filter((c) => !selected.includes(c));
  }, [query, selected]);

  const browse = useMemo(() => {
    if (query.trim()) return [{ group: "Matches", categories: results }];
    return CATEGORY_GROUPS.map((g) => ({
      group: g.group,
      categories: g.categories
        .filter((c) => !selected.includes(c))
        .slice(0, 6),
    })).filter((g) => g.categories.length > 0);
  }, [query, results, selected]);

  const flat = useMemo(
    () => browse.flatMap((g) => g.categories),
    [browse],
  );

  function add(label: string) {
    if (selected.includes(label)) return;
    onChange([...selected, label]);
    setQuery("");
    setHighlight(0);
  }

  function remove(label: string) {
    onChange(selected.filter((c) => c !== label));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (flat[highlight]) add(flat[highlight]!);
      else if (query.trim()) add(query.trim());
      return;
    }
    if (e.key === "Backspace" && !query && selected.length) {
      remove(selected[selected.length - 1]!);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={rootRef}>
      <label className="admin-field">
        <span>Categories you sell</span>
        <div className="tags-box" onClick={() => setOpen(true)}>
          {selected.map((cat) => (
            <span key={cat} className="tag-chip">
              {cat.includes(">") ? cat.split(">").pop()?.trim() : cat}
              <button
                type="button"
                className="tag-chip-x"
                aria-label={`Remove ${cat}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(cat);
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="tags-input"
            disabled={disabled}
            value={query}
            placeholder={
              selected.length
                ? "Add another category…"
                : "Search electronics, shoes, phones…"
            }
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </div>
        <span className="admin-hint">
          Pick from {ALL_CATEGORIES.length} categories · searchable · multiple
        </span>
      </label>

      {open ? (
        <div id={listId} className="combo-menu" role="listbox">
          {flat.length === 0 ? (
            <p className="combo-empty">
              No matches. Press Enter to add “{query.trim() || "…"}” as custom.
            </p>
          ) : (
            browse.map((section) => (
              <div key={section.group} className="combo-section">
                <p className="combo-section-label">{section.group}</p>
                {section.categories.map((label) => {
                  const idx = flat.indexOf(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className={
                        idx === highlight
                          ? "combo-option is-active"
                          : "combo-option"
                      }
                      onMouseEnter={() => setHighlight(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(label);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
