"use client";

import { useEffect, useState } from "react";

type AttributeSuggestion = {
  name: string;
  unit: string | null;
  values: string[];
};

type Props = {
  category: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
};

const CUSTOM = "__custom__";

/**
 * Dynamic attribute dropdowns for the selected category.
 *
 * Fetches attributes lazily per category from /api/catalog/attributes.
 * Skips Condition / Brand / Model — those map to dedicated product columns.
 */
export function CategoryAttributes({
  category,
  values,
  onChange,
  disabled,
}: Props) {
  const [attrs, setAttrs] = useState<AttributeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [customActive, setCustomActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const trimmed = category?.trim();
    if (!trimmed) {
      setAttrs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/catalog/attributes?category=${encodeURIComponent(trimmed)}`,
        );
        const data = (await res.json()) as { attributes?: AttributeSuggestion[] };
        if (!cancelled) {
          const filtered = (data.attributes ?? []).filter(
            (a) => !/^(condition|brand|model|make)$/i.test(a.name.trim()),
          );
          setAttrs(filtered);
          setCustomActive((prev) => {
            const next: Record<string, boolean> = {};
            for (const a of filtered) {
              next[a.name] = prev[a.name] ?? false;
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setAttrs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (!category?.trim() || (attrs.length === 0 && !loading)) return null;

  function update(name: string, value: string) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="admin-form-grid">
      {attrs.map((attr) => {
        const current = values[attr.name] ?? "";
        const isCustom = customActive[attr.name] ?? false;
        const isKnown =
          !current || attr.values.includes(current) || current === "";
        const showSelect = !isCustom && (isKnown || !current);

        return (
          <label className="admin-field" key={attr.name}>
            <span>
              {attr.name}
              {attr.unit ? ` (${attr.unit})` : null}
            </span>
            {showSelect ? (
              <select
                className="field"
                disabled={disabled}
                value={current}
                onChange={(e) => {
                  if (e.target.value === CUSTOM) {
                    setCustomActive((p) => ({ ...p, [attr.name]: true }));
                    update(attr.name, "");
                  } else {
                    update(attr.name, e.target.value);
                  }
                }}
              >
                <option value="">Select {attr.name}…</option>
                {attr.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </select>
            ) : (
              <div className="attr-custom-row">
                <input
                  className="field"
                  disabled={disabled}
                  value={current}
                  onChange={(e) => update(attr.name, e.target.value)}
                  placeholder={`Enter ${attr.name}`}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setCustomActive((p) => ({ ...p, [attr.name]: false }));
                    update(attr.name, "");
                  }}
                >
                  ▾
                </button>
              </div>
            )}
          </label>
        );
      })}
    </div>
  );
}
