"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Package, Send } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney, toMajorString, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Select } from "@/components/ui/field";
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

export function ProductTable({ handle, items, collections, emptyHint }: { handle: string; items: Item[]; collections: { id: string; title: string }[]; emptyHint: string }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
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
    if (action === "delete" && !confirm(`Delete ${selected.size} product(s)? Products still posted in Telegram are archived instead.`)) return;
    setBusy(true);
    try {
      const { count } = await api<{ count: number }>(`/api/shops/${handle}/products/bulk`, {
        body: { action, ids: [...selected], ...(collectionId ? { collectionId } : {}) },
      });
      toast(`${count} product${count === 1 ? "" : "s"} updated`, "success");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk update failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <EmptyState icon={<Package size={28} />} title="No products" body={emptyHint} />;

  return (
    <>
      {selected.size ? (
        <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-signal/30 bg-accent-soft p-2 lg:top-2">
          <span className="px-2 text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" disabled={busy} onClick={() => bulk("publish")}>Publish</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk("sold")}>Mark sold</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk("draft")}>Unpublish</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk("archive")}>Archive</Button>
          {collections.length ? (
            <Select className="h-9 w-auto" value="" disabled={busy} onChange={(e) => e.target.value && bulk("add_to_collection", e.target.value)}>
              <option value="">Add to collection…</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          ) : null}
          <Button size="sm" variant="danger" disabled={busy} onClick={() => bulk("delete")}>Delete</Button>
        </div>
      ) : null}
      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[32px_56px_1fr_140px_90px_110px] items-center gap-3 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-mist md:grid">
          <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSelected(all ? new Set() : new Set(items.map((i) => i.id)))} />
          <span />
          <span>Product</span>
          <span>Price</span>
          <span>Stock</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-line">
          {items.map((p) => (
            <div key={p.id} className={cn("grid grid-cols-[24px_48px_1fr] items-center gap-3 px-4 py-3 md:grid-cols-[32px_56px_1fr_140px_90px_110px]", selected.has(p.id) && "bg-accent-soft/60")}>
              <input type="checkbox" aria-label={`Select ${p.title}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <Link href={`/dashboard/${handle}/products/${p.id}`} className="block">
                {p.images[0]?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0].thumb} alt="" className="h-12 w-12 rounded-lg object-cover md:h-14 md:w-14" />
                ) : (
                  <div className="h-12 w-12 rounded-lg md:h-14 md:w-14" style={{ background: p.images[0]?.color ?? "var(--paper-muted)" }} />
                )}
              </Link>
              <div className="min-w-0">
                <Link href={`/dashboard/${handle}/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">{p.title}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-mist">
                  {p.fromTelegram ? <span className="inline-flex items-center gap-1"><Send size={11} /> Telegram</span> : null}
                  {p.needsPrice ? <span className="font-medium text-warning">Needs price</span> : null}
                  {p.status === "draft" && p.aiConfidence !== null && p.aiConfidence < 0.8 ? <span>Check details</span> : null}
                  <span className="md:hidden"><ProductStatus status={p.status} /></span>
                  <span className="md:hidden">{p.priceMinor ? formatMoney(p.priceMinor, p.currency) : "No price"}</span>
                </div>
              </div>
              <div className="hidden md:block"><PriceCell handle={handle} item={p} /></div>
              <span className="hidden text-sm tabular-nums md:block">{p.trackInventory ? p.inventoryQty : "∞"}</span>
              <span className="hidden md:block"><ProductStatus status={p.status} /></span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PriceCell({ handle, item }: { handle: string; item: Item }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(item.priceMinor ? toMajorString(item.priceMinor) : "");
  const [saving, setSaving] = useState(false);
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
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Add price"
        className="input h-9 pl-11 tabular-nums"
        aria-label={`Price of ${item.title}`}
      />
    </div>
  );
}
