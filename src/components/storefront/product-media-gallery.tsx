"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/ui/image-lightbox";

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
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

  const lightboxImages = usable.map((image) => ({
    src: image.src!,
    alt: image.alt || title,
  }));

  return (
    <>
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
          <button
            type="button"
            className="buy-gallery-open"
            onClick={() => setLightboxOpen(true)}
            aria-label="View photo fullscreen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current!.src!} alt={current?.alt || title} />
          </button>
        </div>
      </div>

      <ImageLightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={active}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setActive}
      />
    </>
  );
}
