"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Img = { id: string; src: string | null; large: string | null; thumb: string | null; color: string | null; width: number | null; height: number | null };

export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [i, setI] = useState(0);
  const cur = images[i];
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl" style={{ background: cur?.color ?? "var(--paper-muted)" }}>
        {cur?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.src} srcSet={cur.large ? `${cur.src} 800w, ${cur.large} 1600w` : undefined} sizes="(min-width: 768px) 50vw, 100vw" alt={title} className="h-full w-full object-contain" />
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, idx) => (
            <button key={img.id} onClick={() => setI(idx)} aria-label={`Photo ${idx + 1}`} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-offset-2", idx === i && "ring-2 ring-[var(--shop-accent)]")} style={{ background: img.color ?? "var(--paper-muted)" }}>
              {img.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.thumb} alt="" className="h-full w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
