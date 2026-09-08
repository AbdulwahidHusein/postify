import Link from "next/link";
import type { PageMeta } from "@/lib/pagination";
import { pageRangeLabel } from "@/lib/pagination";

type Props = {
  meta: PageMeta;
  /** Build href for a page number (server / Link mode). */
  hrefForPage?: (page: number) => string;
  /** Client callback mode (admin tables). */
  onPageChange?: (page: number) => void;
  className?: string;
};

export function PaginationBar({
  meta,
  hrefForPage,
  onPageChange,
  className,
}: Props) {
  if (meta.pageCount <= 1) {
    if (meta.total === 0) return null;
    return (
      <div className={className ? `pager ${className}` : "pager"}>
        <p className="pager-label">{pageRangeLabel(meta)}</p>
      </div>
    );
  }

  const pages = visiblePages(meta.page, meta.pageCount);

  return (
    <nav
      className={className ? `pager ${className}` : "pager"}
      aria-label="Pagination"
    >
      <p className="pager-label">{pageRangeLabel(meta)}</p>
      <div className="pager-controls">
        <PageControl
          label="Previous"
          disabled={!meta.hasPrev}
          href={
            meta.hasPrev && hrefForPage
              ? hrefForPage(meta.page - 1)
              : undefined
          }
          onClick={
            meta.hasPrev && onPageChange
              ? () => onPageChange(meta.page - 1)
              : undefined
          }
        />
        {pages.map((item, i) =>
          item === "…" ? (
            <span key={`ellipsis-${i}`} className="pager-ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <PageControl
              key={item}
              label={String(item)}
              current={item === meta.page}
              href={hrefForPage ? hrefForPage(item) : undefined}
              onClick={
                onPageChange && item !== meta.page
                  ? () => onPageChange(item)
                  : undefined
              }
            />
          ),
        )}
        <PageControl
          label="Next"
          disabled={!meta.hasNext}
          href={
            meta.hasNext && hrefForPage
              ? hrefForPage(meta.page + 1)
              : undefined
          }
          onClick={
            meta.hasNext && onPageChange
              ? () => onPageChange(meta.page + 1)
              : undefined
          }
        />
      </div>
    </nav>
  );
}

function PageControl({
  label,
  href,
  onClick,
  disabled,
  current,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  current?: boolean;
}) {
  const className = current
    ? "pager-btn is-current"
    : disabled
      ? "pager-btn is-disabled"
      : "pager-btn";

  if (href && !disabled && !current) {
    return (
      <Link href={href} className={className} aria-current={current ? "page" : undefined}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || current}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function visiblePages(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const set = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...set]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  const out: Array<number | "…"> = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}
