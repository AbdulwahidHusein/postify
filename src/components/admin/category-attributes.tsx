"use client";

import { useMemo } from "react";
import { attributesForCategory } from "@/lib/catalog/attributes";

type Props = {
  category: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
};

/**
 * Renders dynamic attribute dropdowns based on the selected category.
 * Uses mined category-attributes data (Condition, Brand, Size, Transmission,
 * etc.) to provide datalist suggestions. Sellers can type custom values too.
 */
export function CategoryAttributes({
  category,
  values,
  onChange,
  disabled,
}: Props) {
  const attrs = useMemo(
    () => attributesForCategory(category),
    [category],
  );

  if (attrs.length === 0) return null;

  function update(name: string, value: string) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="admin-form-grid">
      {attrs.map((attr) => {
        const listId = `attr-${attr.name.replace(/\s+/g, "-").toLowerCase()}`;
        return (
          <label className="admin-field" key={attr.name}>
            <span>
              {attr.name}
              {attr.unit ? ` (${attr.unit})` : null}
            </span>
            <input
              className="field"
              list={listId}
              value={values[attr.name] ?? ""}
              onChange={(e) => update(attr.name, e.target.value)}
              disabled={disabled}
              placeholder={
                attr.values.length > 0 ? attr.values[0] : `Enter ${attr.name}`
              }
            />
            <datalist id={listId}>
              {attr.values.slice(0, 30).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        );
      })}
    </div>
  );
}
