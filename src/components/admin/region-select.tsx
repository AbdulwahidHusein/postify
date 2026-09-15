"use client";

import { useMemo, useState } from "react";
import { TOP_REGIONS, regionsByParent, type Region } from "@/lib/catalog/regions-data";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function findRegionByName(name: string | null): Region | null {
  if (!name) return null;
  return TOP_REGIONS.find((r) => r.name === name) ?? null;
}

/**
 * Two-level region picker: top-level region (Addis Ababa, Oromia, etc.) +
 * sub-city/zone. Stores the combined "Region, Sub-city" string.
 * Falls back to free text if the user types something not in the list.
 */
export function RegionSelect({ value, onChange, disabled }: Props) {
  // Split a stored value "Addis Ababa, Bole" back into parts.
  const parts = useMemo(() => {
    if (!value) return { region: "", sub: "" };
    const [region, sub] = value.split(",").map((s) => s.trim());
    return { region: region ?? "", sub: sub ?? "" };
  }, [value]);

  const [regionName, setRegionName] = useState(parts.region);
  const [subName, setSubName] = useState(parts.sub);
  const [customMode, setCustomMode] = useState(
    Boolean(value) && !findRegionByName(parts.region),
  );

  const selectedRegion = findRegionByName(regionName);
  const subRegions = selectedRegion ? regionsByParent(selectedRegion.id) : [];

  function emit(region: string, sub: string) {
    const trimmedSub = sub.trim();
    onChange(
      trimmedSub ? `${region.trim()}, ${trimmedSub}` : region.trim(),
    );
  }

  if (customMode) {
    return (
      <label className="admin-field">
        <span>Location</span>
        <div className="attr-custom-row">
          <input
            className="field"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Addis Ababa, Bole…"
            maxLength={120}
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setCustomMode(false);
              setRegionName("");
              setSubName("");
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
    <div className="admin-field">
      <span>Location</span>
      <div className="region-select-row">
        <select
          className="field"
          value={regionName}
          disabled={disabled}
          onChange={(e) => {
            setRegionName(e.target.value);
            setSubName("");
            emit(e.target.value, "");
          }}
        >
          <option value="">Select region…</option>
          {TOP_REGIONS.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>

        {subRegions.length > 0 ? (
          <select
            className="field"
            value={subName}
            disabled={disabled}
            onChange={(e) => {
              setSubName(e.target.value);
              emit(regionName, e.target.value);
            }}
          >
            <option value="">Select {selectedRegion?.name} area…</option>
            {subRegions.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-xs region-custom-toggle"
        onClick={() => setCustomMode(true)}
      >
        Type custom location instead
      </button>
    </div>
  );
}
