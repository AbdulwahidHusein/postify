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
    return <div className="product-media">No image</div>;
  }

  return (
    <div className="product-gallery">
      <div className="product-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.src!} alt={current.alt || title} />
      </div>
      {usable.length > 1 ? (
        <div className="product-gallery-thumbs">
          {usable.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={
                index === active
                  ? "product-gallery-thumb is-active"
                  : "product-gallery-thumb"
              }
              onClick={() => setActive(index)}
              aria-label={`Show image ${index + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src!} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
