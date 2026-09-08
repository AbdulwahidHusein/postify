"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminProduct, AdminProductImage } from "@/components/admin/types";

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type Props = {
  productId?: string | null;
  images: AdminProductImage[];
  pendingFiles?: PendingImage[];
  onPendingChange?: (files: PendingImage[]) => void;
  onChange?: (product: AdminProduct) => void;
};

function makePending(files: File[]): PendingImage[] {
  return files.map((file) => ({
    id: `pending-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }));
}

export function ProductImageGallery({
  productId,
  images,
  pendingFiles = [],
  onPendingChange,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    images[0]?.id ?? pendingFiles[0]?.id ?? null,
  );
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (images[0]?.id) setActiveId(images[0].id);
    else if (pendingFiles[0]?.id) setActiveId(pendingFiles[0].id);
  }, [images, pendingFiles]);

  useEffect(() => {
    return () => {
      // revoke only on unmount of pending urls owned here — parent may revoke on remove
    };
  }, []);

  const savedActive = images.find((img) => img.id === activeId) ?? null;
  const pendingActive =
    pendingFiles.find((img) => img.id === activeId) ?? null;
  const heroSrc = savedActive?.src ?? pendingActive?.previewUrl ?? null;
  const totalCount = images.length + pendingFiles.length;
  const canAdd = totalCount < 12;

  async function applyProduct(res: Response) {
    const data = (await res.json()) as {
      product?: AdminProduct;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    if (data.product) {
      onChange?.(data.product);
      if (
        data.product.images.length &&
        !data.product.images.some((i) => i.id === activeId)
      ) {
        setActiveId(data.product.images[0]?.id ?? null);
      }
    }
  }

  function addPending(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!incoming.length || !onPendingChange) return;
    const room = 12 - totalCount;
    const next = makePending(incoming.slice(0, Math.max(0, room)));
    if (!next.length) return;
    onPendingChange([...pendingFiles, ...next]);
    setActiveId(next[0]?.id ?? activeId);
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!productId) {
      addPending(files);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

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

  async function onDeleteSaved(imageId: string) {
    if (!productId) return;
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

  function onDeletePending(imageId: string) {
    if (!onPendingChange) return;
    const target = pendingFiles.find((p) => p.id === imageId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = pendingFiles.filter((p) => p.id !== imageId);
    onPendingChange(next);
    if (activeId === imageId) {
      setActiveId(images[0]?.id ?? next[0]?.id ?? null);
    }
  }

  async function move(imageId: string, dir: -1 | 1) {
    if (!productId) return;
    const index = images.findIndex((i) => i.id === imageId);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= images.length) return;
    const ordered = [...images];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
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
    if (!productId || images[0]?.id === imageId) return;
    const rest = images.filter((i) => i.id !== imageId);
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

  function movePending(imageId: string, dir: -1 | 1) {
    if (!onPendingChange) return;
    const index = pendingFiles.findIndex((i) => i.id === imageId);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= pendingFiles.length) return;
    const ordered = [...pendingFiles];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    onPendingChange(ordered);
  }

  return (
    <section className="gallery">
      <div className="gallery-head">
        <div>
          <p className="admin-kicker">Photos</p>
          <h2 className="admin-h2">Product gallery</h2>
          <p className="admin-hint">
            {productId
              ? "Up to 12 images · first is cover."
              : "Add photos now — they upload when you save the product."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={uploading || !canAdd}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Add photos"}
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
        onClick={() => !uploading && canAdd && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {heroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroSrc} alt="" className="gallery-hero" />
        ) : (
          <div className="gallery-empty">
            <strong>Add product photos</strong>
            <span>Tap or drop images here</span>
          </div>
        )}
      </div>

      {totalCount > 0 ? (
        <div className="gallery-thumbs">
          {images.map((image, index) => (
            <div
              key={image.id}
              className={
                image.id === activeId
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
                {index === 0 ? (
                  <span className="gallery-cover">Cover</span>
                ) : null}
              </button>
              <div className="gallery-thumb-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={busyId === image.id || index === 0}
                  onClick={() => void move(image.id, -1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={
                    busyId === image.id || index === images.length - 1
                  }
                  onClick={() => void move(image.id, 1)}
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
                  onClick={() => void onDeleteSaved(image.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {pendingFiles.map((image, index) => (
            <div
              key={image.id}
              className={
                image.id === activeId
                  ? "gallery-thumb is-active"
                  : "gallery-thumb"
              }
            >
              <button
                type="button"
                className="gallery-thumb-btn"
                onClick={() => setActiveId(image.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt="" />
                {images.length === 0 && index === 0 ? (
                  <span className="gallery-cover">Cover</span>
                ) : (
                  <span className="gallery-cover">Ready</span>
                )}
              </button>
              <div className="gallery-thumb-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={index === 0}
                  onClick={() => movePending(image.id, -1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={index === pendingFiles.length - 1}
                  onClick={() => movePending(image.id, 1)}
                >
                  →
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs is-danger"
                  onClick={() => onDeletePending(image.id)}
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
