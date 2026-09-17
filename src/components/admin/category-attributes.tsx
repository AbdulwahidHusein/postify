"use client";

import { useEffect, useState } from "react";

type FormFieldMeta = {
  name: string;
  required?: boolean;
};

type Props = {
  category: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
};

/**
 * Category-specific detail fields from mined Jiji form_fields (names only).
 * Values are free text — we don't require enums.
 */
export function CategoryAttributes({
  category,
  values,
  onChange,
  disabled,
}: Props) {
  const [fields, setFields] = useState<FormFieldMeta[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = category?.trim();
    if (!trimmed) {
      setFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/catalog/form-fields?category=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          fields?: Array<{ name?: string; required?: boolean }>;
        };
        if (cancelled) return;
        const next = (data.fields ?? [])
          .map((f) => ({
            name: (f.name ?? "").trim(),
            required: Boolean(f.required),
          }))
          .filter(
            (f) =>
              f.name &&
              !/^(condition|brand|model|make)$/i.test(f.name),
          );
        // Dedupe by name
        const seen = new Set<string>();
        setFields(
          next.filter((f) => {
            const key = f.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        );
      } catch {
        if (!cancelled) setFields([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (!category?.trim() || (fields.length === 0 && !loading)) return null;

  function update(name: string, value: string) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="product-editor-attrs">
      <p className="product-editor-attrs-label">
        Category details
        {loading ? "…" : null}
      </p>
      <div className="product-editor-row product-editor-attrs-grid">
        {fields.map((field) => (
          <label className="admin-field" key={field.name}>
            <span>
              {field.name}
              {field.required ? (
                <span className="product-editor-req" aria-hidden>
                  {" "}
                  *
                </span>
              ) : null}
            </span>
            <input
              className="field"
              disabled={disabled}
              value={values[field.name] ?? ""}
              onChange={(e) => update(field.name, e.target.value)}
              placeholder={field.name}
              maxLength={120}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
