"use client";

type Size = "sm" | "md" | "lg";

function Spinner({ size = "md" }: { size?: Size }) {
  return (
    <span
      className={`pf-spinner pf-spinner--${size}`}
      aria-hidden
    />
  );
}

/** Full-area centered loader for pages / gates / Suspense. */
export function PageLoader({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`pf-loader pf-loader--page ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" />
      <span className="pf-loader-label">{label}</span>
    </div>
  );
}

/** Compact inline loader for panels / sections. */
export function InlineLoader({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`pf-loader pf-loader--inline ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="sm" />
      <span className="pf-loader-label">{label}</span>
    </div>
  );
}

export { Spinner };
