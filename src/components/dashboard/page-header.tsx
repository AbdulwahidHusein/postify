import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  back,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Inline status pills etc. shown beside the title. */
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      {back ? (
        <Link href={back.href} className="mb-3 inline-flex h-10 items-center gap-2 rounded-full bg-surface pl-3 pr-4 font-display text-[13px] font-semibold text-ink transition-colors hover:bg-sunken">
          <ArrowLeft size={16} strokeWidth={2.4} /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="page-title">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1.5 max-w-2xl text-[15px] font-semibold text-mist">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
