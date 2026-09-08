"use client";

import { useState } from "react";

type Image = {
  id: string;
  src: string | null;
  alt?: string | null;
};

export function ProductMediaGallery({
  title,
  images,
}: {
  title: string;
  images: Image[];
}) {
  const usable = images.filter((i) => i.src);
  const [active, setActive] = useState(0);
  const current = usable[active] ?? usable[0];

  if (!usable.length) {
    return (
      <div className="buy-gallery">
        <div className="buy-gallery-stage buy-gallery-empty">
          <span>No photo yet</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        usable.length > 1 ? "buy-gallery has-thumbs" : "buy-gallery"
      }
    >
      {usable.length > 1 ? (
        <div className="buy-gallery-thumbs" role="list">
          {usable.map((image, index) => (
            <button
              key={image.id}
              type="button"
              role="listitem"
              className={
                index === active
                  ? "buy-gallery-thumb is-active"
                  : "buy-gallery-thumb"
              }
              onClick={() => setActive(index)}
              aria-label={`Photo ${index + 1}`}
              aria-pressed={index === active}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src!} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="buy-gallery-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current!.src!} alt={current?.alt || title} />
      </div>
    </div>
  );
}
