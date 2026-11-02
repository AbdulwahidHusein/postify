"use client";

import { useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Img = { id: string; src: string | null; large: string | null; thumb: string | null; color: string | null; width: number | null; height: number | null };

/** Swipeable on phones (scroll-snap, no JS gestures), thumbnails on desktop. */
export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [i, setI] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const go = (idx: number) => {
    setI(idx);
    const el = rail.current;
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };
  if (!images.length) {
    return <div className="-mx-4 grid aspect-square place-items-center bg-sunken text-faint sm:mx-0 sm:rounded-[28px]"><ImageIcon size={36} /></div>;
  }
  return (
    <div className="md:sticky md:top-20">
      <div className="relative -mx-4 sm:mx-0">
        <div
          ref={rail}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto bg-surface sm:rounded-[28px]"
          onScroll={(e) => {
            const el = e.currentTarget;
            const idx = Math.round(el.scrollLeft / el.clientWidth);
            if (idx !== i) setI(idx);
          }}
          aria-roledescription="carousel"
          aria-label={title}
        >
          {images.map((img, idx) => (
            <div key={img.id} className="relative h-full w-full shrink-0 snap-center" style={{ background: img.color ?? undefined }} aria-roledescription="slide" aria-label={`${idx + 1} / ${images.length}`}>
              {img.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  srcSet={img.large ? `${img.src} 800w, ${img.large} 1600w` : undefined}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  alt={idx === 0 ? title : ""}
                  loading={idx === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          ))}
        </div>
        {images.length > 1 ? (
          <>
            <span className="num absolute right-3 top-3 rounded-full bg-ink px-3 py-1 font-display text-xs font-bold text-white md:hidden">
              {i + 1} / {images.length}
            </span>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
              {images.map((img, idx) => (
                <span key={img.id} className={cn("h-1.5 rounded-full transition-all duration-200", idx === i ? "w-5 bg-ink" : "w-1.5 bg-ink/25")} />
              ))}
            </div>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="mt-3 hidden gap-2.5 md:flex">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => go(idx)}
              aria-label={`Photo ${idx + 1}`}
              aria-current={idx === i}
              className={cn("h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[18px] transition-[box-shadow,opacity]", idx === i ? "ring-[3px] ring-ink" : "opacity-70 hover:opacity-100")}
              style={{ background: img.color ?? "var(--sunken)" }}
            >
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
