"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ALL_CATEGORIES,
  CATEGORY_GROUPS,
  searchCategories,
} from "@/lib/catalog/categories";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function CategoryCombobox({ value, onChange, disabled }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const searchSource = open ? query : value;
  const results = useMemo(
    () => searchCategories(searchSource, 50),
    [searchSource],
  );

  const grouped = useMemo(() => {
    if ((open ? query : value).trim()) {
      return [{ group: "Matches", categories: results }];
    }
    return CATEGORY_GROUPS.map((g) => ({
      group: g.group,
      categories: g.categories.slice(0, 8),
    }));
  }, [open, query, value, results]);

  const flat = useMemo(
    () => grouped.flatMap((g) => g.categories),
    [grouped],
  );

  const inputValue = open ? query : value;

  function select(label: string) {
    onChange(label);
    setQuery(label);
    setOpen(false);
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
      setHighlight((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flat[highlight];
      if (pick) select(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
    }
  }

  return (
    <div className="combo" ref={rootRef}>
      <label className="admin-field">
        <span>Category</span>
        <div className="combo-input-wrap">
          <input
            className="field"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            disabled={disabled}
            value={inputValue}
            placeholder="Search electronics, shoes, phones, cards…"
            onFocus={() => {
              setQuery(value);
              setOpen(true);
              setHighlight(0);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="combo-toggle"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Browse categories"
            onClick={() => {
              if (!open) setQuery(value);
              setOpen((o) => !o);
            }}
          >
            ▾
          </button>
        </div>
      </label>

      {open ? (
        <div id={listId} className="combo-menu" role="listbox">
          {flat.length === 0 ? (
            <p className="combo-empty">
              No categories match. Keep typing a custom one.
            </p>
          ) : (
            grouped.map((section) =>
              section.categories.length === 0 ? null : (
                <div key={section.group} className="combo-section">
                  <p className="combo-section-label">{section.group}</p>
                  {section.categories.map((label) => {
                    const idx = flat.indexOf(label);
                    const active = idx === highlight;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="option"
                        aria-selected={value === label}
                        className={
                          active ? "combo-option is-active" : "combo-option"
                        }
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => select(label)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ),
            )
          )}
          {!query.trim() ? (
            <p className="combo-hint">
              Type to search all {ALL_CATEGORIES.length} categories across{" "}
              {CATEGORY_GROUPS.length} groups
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
