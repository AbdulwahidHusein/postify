"use client";

import { useEffect, useState } from "react";

/**
 * Select with suggested values + "Custom…" free-text escape hatch.
 * Always looks like a dropdown first — never a naked text input.
 */
const CUSTOM = "__custom__";

type Props = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function SuggestSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: Props) {
  const inList = Boolean(value) && options.includes(value);
  const [custom, setCustom] = useState(Boolean(value) && !inList && !options.includes(value));

  useEffect(() => {
    if (!value) {
      setCustom(false);
      return;
    }
    if (options.includes(value)) {
      setCustom(false);
      return;
    }
    // Existing free-text value not in suggestions → stay in custom mode
    setCustom(true);
  }, [value, options]);

  if (custom) {
    return (
      <label className="admin-field">
        <span>{label}</span>
        <div className="attr-custom-row">
          <input
            className="field"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? `Enter ${label}`}
            maxLength={120}
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onChange("");
            }}
          >
            ▾
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="admin-field">
      <span>{label}</span>
      <select
        className="field"
        disabled={disabled}
        value={inList ? value : ""}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder ?? `Select ${label}…`}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
    </label>
  );
}
