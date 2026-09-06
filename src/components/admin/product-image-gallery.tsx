"use client";

import { useRef, useState } from "react";
import type { AdminProduct, AdminProductImage } from "@/components/admin/types";

type Props = {
  productId: string;
  images: AdminProductImage[];
  onChange: (product: AdminProduct) => void;
};

export function ProductImageGallery({ productId, images, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(images[0]?.id ?? null);
  const [dragOver, setDragOver] = useState(false);

  const active =
    images.find((img) => img.id === activeId) ?? images[0] ?? null;

  async function applyProduct(res: Response) {
    const data = (await res.json()) as {
      product?: AdminProduct;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    if (data.product) {
      onChange(data.product);
      if (data.product.images.length && !data.product.images.some((i) => i.id === activeId)) {
        setActiveId(data.product.images[0]?.id ?? null);
      }
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`/api/products/${productId}/images`, {
          method: "POST",
          credentials: "include",
          body,
        });
        await applyProduct(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(imageId: string) {
    if (!confirm("Remove this image?")) return;
    setBusyId(imageId);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${productId}/images/${imageId}`,
        { method: "DELETE", credentials: "include" },
      );
      await applyProduct(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function move(imageId: string, dir: -1 | 1) {
    const index = images.findIndex((i) => i.id === imageId);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= images.length) return;
    const ordered = [...images];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);
    setBusyId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/images`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((i) => i.id) }),
      });
      await applyProduct(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setBusyId(null);
    }
  }

  async function makeCover(imageId: string) {
    if (images[0]?.id === imageId) return;
    const rest = images.filter((i) => i.id !== imageId);
    const target = images.find((i) => i.id === imageId);
    if (!target) return;
    setBusyId(imageId);
    try {
      const res = await fetch(`/api/products/${productId}/images`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedIds: [imageId, ...rest.map((i) => i.id)],
        }),
      });
      await applyProduct(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set cover");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="gallery">
      <div className="gallery-head">
        <div>
          <p className="admin-kicker">Media</p>
          <h2 className="admin-h2">Product gallery</h2>
          <p className="admin-hint">
            Up to 12 images · JPG, PNG, WebP, GIF · max 8MB each. First image is
            the cover.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={uploading || images.length >= 12}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Add images"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
          }}
        />
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div
        className={
          dragOver ? "gallery-dropzone is-dragover" : "gallery-dropzone"
        }
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) {
            void uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {active?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.src} alt={active.alt ?? ""} className="gallery-hero" />
        ) : (
          <div className="gallery-empty">
            <strong>Drop images here</strong>
            <span>or click to browse your files</span>
          </div>
        )}
      </div>

      {images.length > 0 ? (
        <div className="gallery-thumbs">
          {images.map((image, index) => (
            <div
              key={image.id}
              className={
                image.id === active?.id
                  ? "gallery-thumb is-active"
                  : "gallery-thumb"
              }
            >
              <button
                type="button"
                className="gallery-thumb-btn"
                onClick={() => setActiveId(image.id)}
              >
                {image.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.src} alt="" />
                ) : null}
                {index === 0 ? <span className="gallery-cover">Cover</span> : null}
              </button>
              <div className="gallery-thumb-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={busyId === image.id || index === 0}
                  onClick={() => void move(image.id, -1)}
                  aria-label="Move left"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={busyId === image.id || index === images.length - 1}
                  onClick={() => void move(image.id, 1)}
                  aria-label="Move right"
                >
                  →
                </button>
                {index !== 0 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={busyId === image.id}
                    onClick={() => void makeCover(image.id)}
                  >
                    Cover
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs is-danger"
                  disabled={busyId === image.id}
                  onClick={() => void onDelete(image.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
