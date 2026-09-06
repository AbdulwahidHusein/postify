"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  parseTags,
  searchSuggestedTags,
  serializeTags,
} from "@/lib/catalog/tags";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function TagsInput({ value, onChange, disabled }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const tags = useMemo(() => parseTags(value), [value]);
  const suggestions = useMemo(
    () => searchSuggestedTags(draft, tags, 20),
    [draft, tags],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(raw: string) {
    const next = parseTags(raw);
    if (!next.length) return;
    const merged = parseTags(serializeTags([...tags, ...next]));
    onChange(serializeTags(merged));
    setDraft("");
    setHighlight(0);
  }

  function remove(tag: string) {
    onChange(serializeTags(tags.filter((t) => t !== tag)));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && suggestions[highlight]) {
        commit(suggestions[highlight]);
        return;
      }
      if (draft.trim()) commit(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && tags.length) {
      remove(tags[tags.length - 1]!);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="combo tags-combo" ref={rootRef}>
      <label className="admin-field">
        <span>Tags</span>
        <div
          className="tags-box"
          onClick={() => inputRef.current?.focus()}
        >
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button
                type="button"
                className="tag-chip-x"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(tag);
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="tags-input"
            disabled={disabled}
            value={draft}
            placeholder={
              tags.length ? "Add another tag…" : "Search or type tags…"
            }
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
            aria-autocomplete="list"
            aria-controls={listId}
          />
        </div>
        <span className="admin-hint">
          Press Enter or comma to add · click suggestions · searchable
        </span>
      </label>

      {open && suggestions.length > 0 ? (
        <div id={listId} className="combo-menu" role="listbox">
          <p className="combo-section-label">Suggested tags</p>
          {suggestions.map((tag, idx) => (
            <button
              key={tag}
              type="button"
              role="option"
              aria-selected={idx === highlight}
              className={
                idx === highlight ? "combo-option is-active" : "combo-option"
              }
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(tag);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
