export const DEFAULT_PAGE_SIZE = 24;
export const ADMIN_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

function toPositiveInt(value: number | string | null | undefined, fallback: number) {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function normalizePagination(opts?: {
  page?: number | string | null;
  pageSize?: number | string | null;
  /** Alias for pageSize (API `limit`) */
  limit?: number | string | null;
  defaultPageSize?: number;
  maxPageSize?: number;
}): { page: number; pageSize: number; offset: number } {
  const defaultPageSize = opts?.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = opts?.maxPageSize ?? MAX_PAGE_SIZE;
  const page = toPositiveInt(opts?.page, 1);
  const rawSize = opts?.pageSize ?? opts?.limit ?? defaultPageSize;
  const pageSize = Math.min(toPositiveInt(rawSize, defaultPageSize), maxPageSize);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildPageMeta(
  total: number,
  page: number,
  pageSize: number,
): PageMeta {
  const safeTotal = Math.max(0, total);
  const pageCount =
    safeTotal === 0 ? 0 : Math.ceil(safeTotal / Math.max(1, pageSize));
  const safePage =
    pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  return {
    page: safePage,
    pageSize,
    total: safeTotal,
    pageCount,
    hasNext: pageCount > 0 && safePage < pageCount,
    hasPrev: safePage > 1,
  };
}

/** Inclusive label like “1–20 of 86”. */
export function pageRangeLabel(meta: PageMeta): string {
  if (meta.total === 0) return "0 items";
  const start = (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);
  return `${start}–${end} of ${meta.total}`;
}
