"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          // Clipboard blocked (e.g. insecure context): leave the text selectable.
        }
      }}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-2.5 text-[13px] font-semibold text-ink hover:bg-canvas", className)}
    >
      {done ? <Check size={14} className="text-brand-ink" /> : <Copy size={14} />}
      {done ? "Copied" : label}
    </button>
  );
}
