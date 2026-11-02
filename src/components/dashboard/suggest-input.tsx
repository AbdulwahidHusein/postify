"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/field";

/** Free-text input with catalog suggestions (native datalist: fast, accessible). */
export function SuggestInput({
  kind,
  value,
  onChange,
  params,
  placeholder,
}: {
  kind: "categories" | "brands" | "models" | "regions" | "conditions";
  value: string;
  onChange: (v: string) => void;
  params?: Record<string, string | null | undefined>;
  placeholder?: string;
}) {
  const id = useId();
  const [options, setOptions] = useState<string[]>([]);
  const paramKey = JSON.stringify(params ?? {});

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ kind, q: value });
      for (const [k, v] of Object.entries(JSON.parse(paramKey) as Record<string, string | null>)) if (v) qs.set(k, v);
      fetch(`/api/catalog?${qs}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { items?: string[] }) => setOptions(d.items ?? []))
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [kind, value, paramKey]);

  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <datalist id={id}>
        {options.slice(0, 30).map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}
