"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ImageIcon, Package, Send, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney, toMajorString, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProductStatus } from "@/components/status";
import { useToast } from "@/components/ui/toast";

type Item = {
  id: string;
  title: string;
  status: string;
  needsPrice: boolean;
  priceMinor: string | null;
  currency: string;
  inventoryQty: number;
  trackInventory: boolean;
  aiConfidence: number | null;
  fromTelegram: boolean;
  images: { thumb: string | null; color: string | null }[];
};

export function ProductTable({
  handle,
  items,
  collections,
  emptyTitle,
  emptyHint,
  toolbar,
  footer,
}: {
  handle: string;
  items: Item[];
  collections: { id: string; title: string }[];
  emptyTitle: string;
  emptyHint: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const all = items.length > 0 && selected.size === items.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulk(action: string, collectionId?: string) {
    if (!selected.size) return;
    setBusy(true);
    try {
      const { count } = await api<{ count: number }>(`/api/shops/${handle}/products/bulk`, {
        body: { action, ids: [...selected], ...(collectionId ? { collectionId } : {}) },
      });
      toast(`${count} product${count === 1 ? "" : "s"} updated`, "success");
      setSelected(new Set());
      setConfirmDelete(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update those products. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const href = (p: Item) => `/dashboard/${handle}/products/${p.id}`;

  return (
    <>
      <div className="panel overflow-hidden">
        {toolbar}
        {items.length ? (
          <>
            <table className="hidden w-full border-t border-line text-sm md:table">
              <thead>
                <tr className="bg-canvas text-left text-xs text-mist">
                  <th className="w-12 py-2.5 pl-5 pr-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" aria-label="Select all products on this page" checked={all} onChange={() => setSelected(all ? new Set() : new Set(items.map((i) => i.id)))} />
                  </th>
                  <th className="py-2.5 pr-3 font-medium">Product</th>
                  <th className="w-40 px-3 py-2.5 font-medium">Price</th>
                  <th className="w-24 px-3 py-2.5 text-right font-medium">Stock</th>
                  <th className="w-32 py-2.5 pl-3 pr-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((p) => (
                  <tr key={p.id} className={cn("transition-colors hover:bg-canvas", selected.has(p.id) && "bg-brand-soft/50 hover:bg-brand-soft/60")}>
                    <td className="py-2.5 pl-5 pr-2">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" aria-label={`Select ${p.title}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link href={href(p)} className="flex min-w-0 items-center gap-3">
                        <Thumb item={p} size={44} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold hover:underline">{p.title}</span>
                          <Flags item={p} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2"><PriceCell handle={handle} item={p} /></td>
                    <td className="num px-3 py-2.5 text-right"><Stock item={p} /></td>
                    <td className="py-2.5 pl-3 pr-5"><ProductStatus status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {items.map((p) => (
                <li key={p.id} className={cn("flex items-center gap-3 px-4 py-3", selected.has(p.id) && "bg-brand-soft/50")}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--brand)]" aria-label={`Select ${p.title}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <Link href={href(p)} className="flex min-w-0 flex-1 items-center gap-3">
                    <Thumb item={p} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.title}</span>
                      <span className="num block text-sm text-ink-soft">{p.priceMinor ? formatMoney(BigInt(p.priceMinor), p.currency) : <span className="font-medium text-adey-ink">No price yet</span>}</span>
                      <span className="mt-1 flex items-center gap-2"><ProductStatus status={p.status} /><span className="text-xs text-mist"><Stock item={p} short /></span></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center border-t border-line px-6 py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-sunken text-ink-soft"><Package size={20} /></span>
            <p className="font-display font-semibold">{emptyTitle}</p>
            <p className="mt-1 max-w-sm text-sm text-mist">{emptyHint}</p>
          </div>
        )}
        {footer}
      </div>

      {selected.size ? (
        <div className="fixed inset-x-3 bottom-[76px] z-40 mx-auto flex max-w-2xl animate-sheet-in flex-wrap items-center gap-1.5 rounded-2xl bg-ink p-2 pl-4 text-white shadow-pop lg:bottom-6 lg:left-[248px]" role="toolbar" aria-label="Bulk actions">
          <span className="num mr-1 text-sm font-semibold">{selected.size} selected</span>
          <BarButton disabled={busy} onClick={() => bulk("publish")}>Publish</BarButton>
          <BarButton disabled={busy} onClick={() => bulk("draft")}>Unpublish</BarButton>
          <BarButton disabled={busy} onClick={() => bulk("sold")}>Mark sold</BarButton>
          <BarButton disabled={busy} onClick={() => bulk("archive")}>Archive</BarButton>
          {collections.length ? (
            <select
              className="h-8 rounded-lg bg-white/10 px-2 text-[13px] font-semibold text-white outline-none hover:bg-white/15 [&>option]:text-ink"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && bulk("add_to_collection", e.target.value)}
              aria-label="Add to collection"
            >
              <option value="">Add to collection</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          ) : null}
          <BarButton disabled={busy} onClick={() => setConfirmDelete(true)} className="text-[#ff9d94]">Delete</BarButton>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        description="Products still posted in Telegram are archived instead, so their posts keep working."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep them</Button>
            <Button variant="danger-solid" disabled={busy} onClick={() => bulk("delete")}>{busy ? "Deleting…" : "Delete"}</Button>
          </>
        }
      >
        <p className="text-sm text-mist">This can&apos;t be undone.</p>
      </Dialog>
    </>
  );
}

function BarButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("h-8 rounded-lg px-2.5 text-[13px] font-semibold hover:bg-white/10 disabled:opacity-50", className)} />;
}

function Thumb({ item, size }: { item: Item; size: number }) {
  const img = item.images[0];
  return img?.thumb ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img.thumb} alt="" className="shrink-0 rounded-[10px] object-cover ring-1 ring-line" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[10px] bg-sunken text-faint" style={{ width: size, height: size, background: img?.color ?? undefined }}>
      <ImageIcon size={size * 0.38} />
    </span>
  );
}

function Flags({ item: p }: { item: Item }) {
  const flags: ReactNode[] = [];
  if (p.fromTelegram) flags.push(<span key="tg" className="inline-flex items-center gap-1 text-[#106a96]"><Send size={11} /> From Telegram</span>);
  if (p.needsPrice) flags.push(<span key="np" className="font-semibold text-adey-ink">Needs a price</span>);
  if (p.status === "draft" && p.aiConfidence !== null && p.aiConfidence < 0.8) flags.push(<span key="ck" className="font-semibold text-adey-ink">Check details</span>);
  if (!flags.length) return null;
  return <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs">{flags}</span>;
}

function Stock({ item: p, short }: { item: Item; short?: boolean }) {
  if (!p.trackInventory) return <span className="text-mist">{short ? "Not tracked" : "—"}</span>;
  if (p.inventoryQty === 0) return <span className="font-semibold text-danger">{short ? "Out of stock" : "0"}</span>;
  return <span>{p.inventoryQty}{short ? " in stock" : ""}</span>;
}

function PriceCell({ handle, item }: { handle: string; item: Item }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(item.priceMinor ? toMajorString(item.priceMinor) : "");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const original = item.priceMinor ? toMajorString(item.priceMinor) : "";

  async function save() {
    if (value === original) return;
    const minor = value.trim() ? toMinor(value) : null;
    if (value.trim() && minor === null) {
      toast("Enter a valid price", "error");
      setValue(original);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/shops/${handle}/products/${item.id}`, { method: "PATCH", body: { price: value.trim() || null } });
      toast("Price updated. Telegram buttons update too.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
      setValue(original);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-mist">{item.currency}</span>
      <input
        inputMode="decimal"
        value={focused || !value || Number.isNaN(Number(value)) ? value : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}
        disabled={saving}
        onFocus={() => setFocused(true)}
        onChange={(e) => setValue(e.target.value.replace(/,/g, ""))}
        onBlur={() => {
          setFocused(false);
          void save();
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Add a price"
        className="input num h-9 border-transparent bg-transparent pl-11 hover:border-line-strong focus:bg-surface"
        aria-label={`Price of ${item.title}`}
      />
    </div>
  );
}
