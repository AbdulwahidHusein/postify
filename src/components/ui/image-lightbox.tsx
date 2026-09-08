"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";

export type LightboxImage = {
  src: string;
  alt?: string;
};

type Props = {
  images: LightboxImage[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function subscribe() {
  return () => {};
}

function LightboxStage({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );
  const lastTap = useRef(0);
  const moved = useRef(false);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  function onWheel(e: ReactWheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    setScale((s) => {
      const next = clamp(s + delta, MIN_SCALE, MAX_SCALE);
      if (next <= 1.01) {
        setTx(0);
        setTy(0);
        return 1;
      }
      return next;
    });
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStart.current = { dist, scale };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, tx, ty };
      pinchStart.current = null;
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const next = clamp(
        (pinchStart.current.scale * dist) / pinchStart.current.dist,
        MIN_SCALE,
        MAX_SCALE,
      );
      moved.current = true;
      setScale(next);
      if (next <= 1.01) {
        setTx(0);
        setTy(0);
      }
      return;
    }

    if (pointers.current.size === 1 && panStart.current && scale > 1.01) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setTx(panStart.current.tx + dx);
      setTy(panStart.current.ty + dy);
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      if (scale < 1.05) resetTransform();
    }
  }

  function onDoubleActivate(clientX: number, clientY: number) {
    if (scale > 1.05) {
      resetTransform();
      return;
    }
    const stage = stageRef.current?.getBoundingClientRect();
    if (stage) {
      const cx = stage.left + stage.width / 2;
      const cy = stage.top + stage.height / 2;
      setScale(2.4);
      setTx((cx - clientX) * 0.7);
      setTy((cy - clientY) * 0.7);
    } else {
      setScale(2.4);
    }
  }

  function onStageClick(e: ReactMouseEvent) {
    if (moved.current) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onDoubleActivate(e.clientX, e.clientY);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    if (e.target === e.currentTarget && scale <= 1.01) onClose();
  }

  return (
    <div
      ref={stageRef}
      className="img-lightbox-stage"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onStageClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="img-lightbox-img"
        draggable={false}
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          cursor: scale > 1.01 ? "grab" : "zoom-in",
        }}
      />
    </div>
  );
}

export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  onIndexChange,
}: Props) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const total = images.length;
  const current = images[index];
  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && canPrev) onIndexChange?.(index - 1);
      if (e.key === "ArrowRight" && canNext) onIndexChange?.(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, canPrev, canNext, index, onIndexChange]);

  if (!mounted || !open || !current) return null;

  return createPortal(
    <div
      className="img-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <div className="img-lightbox-chrome">
        <button
          type="button"
          className="img-lightbox-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {total > 1 ? (
          <span className="img-lightbox-count">
            {index + 1} / {total}
          </span>
        ) : null}
      </div>

      {canPrev ? (
        <button
          type="button"
          className="img-lightbox-nav is-prev"
          aria-label="Previous photo"
          onClick={() => onIndexChange?.(index - 1)}
        >
          ‹
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          className="img-lightbox-nav is-next"
          aria-label="Next photo"
          onClick={() => onIndexChange?.(index + 1)}
        >
          ›
        </button>
      ) : null}

      <LightboxStage
        key={`${current.src}-${index}`}
        src={current.src}
        alt={current.alt ?? ""}
        onClose={onClose}
      />

      <p className="img-lightbox-hint">
        Pinch or scroll to zoom · double-tap to toggle
      </p>
    </div>,
    document.body,
  );
}
