"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Copy, Paintbrush, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Collection = { id: string; title: string; handle: string; productCount: number };

/** Online store overview: open the customizer, share the address, manage collections. */
export function StoreEditor({
  handle, address, collections, status, summary,
}: {
  handle: string;
  address: string;
  collections: Collection[];
  status: { unpublished: boolean; publishedAt: string | null };
  summary: { theme: string; accent: string; sections: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [newCol, setNewCol] = useState("");

  async function addCollection() {
    if (!newCol.trim()) return;
    try {
      await api(`/api/shops/${handle}/collections`, { body: { title: newCol.trim() } });
      setNewCol("");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create", "error");
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection? Products stay in your shop.")) return;
    await api(`/api/shops/${handle}/collections/${id}`, { method: "DELETE" }).catch(() => toast("Could not delete", "error"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid overflow-hidden rounded-[var(--radius-card)] bg-ink text-white sm:grid-cols-[1fr_auto]">
        <div className="p-6 sm:p-7">
          <p className="flex items-center gap-2 font-display text-[13px] font-bold text-white/70">
            <span className={cn("h-2 w-2 rounded-full", status.unpublished ? "bg-adey" : "bg-success-dot")} />
            {status.unpublished ? "You have unpublished changes" : status.publishedAt ? `Live · last published ${new Date(status.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Live"}
          </p>
          <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em]">Make your store look like your brand</h2>
          <p className="mt-2 max-w-lg text-[15px] font-semibold text-white/70">Themes, colors, fonts, banners, promos with countdowns, FAQ and more. Edit with a live preview, publish when you’re happy.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/dashboard/${handle}/store/editor`} className={buttonVariants({ size: "lg" })}><Paintbrush size={18} strokeWidth={2.4} /> Customize store</Link>
            <a href={address} target="_blank" rel="noreferrer" className="inline-flex h-[52px] items-center gap-2 rounded-full bg-white/10 px-6 font-display font-bold transition-colors hover:bg-white/20">View store <ArrowUpRight size={17} /></a>
          </div>
        </div>
        <div className="hidden items-end gap-3 p-7 sm:flex">
          <div className="flex flex-col gap-1.5 rounded-[20px] bg-white/[0.07] p-4 text-[13px] font-semibold text-white/70">
            <span>Theme <b className="ml-1 font-display text-white">{summary.theme}</b></span>
            <span className="flex items-center gap-1.5">Color <span className="h-4 w-4 rounded-full ring-2 ring-white/20" style={{ background: summary.accent }} /></span>
            <span>Sections <b className="ml-1 font-display text-white">{summary.sections}</b></span>
          </div>
        </div>
      </section>

      <section className="card flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-mist">Your shop address</p>
          <p className="truncate font-display text-[17px] font-bold">{address.replace(/^https?:\/\//, "")}</p>
        </div>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(address).then(() => toast("Address copied", "success"))}><Copy size={16} /> Copy</Button>
        <a href={`https://t.me/share/url?url=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "telegram" })}>Share in Telegram</a>
      </section>

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="panel-title">Collections</h2>
          <p className="mt-1 text-[14px] font-semibold text-mist">Group products, then feature them on your store. Add products from the Products page with “Add to collection”.</p>
        </div>
        {collections.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[18px] bg-sunken">
            {collections.map((c) => (
              <li key={c.id} className="flex min-h-14 items-center gap-3 px-4">
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{c.title}</span>
                <span className="text-[13px] font-bold text-mist">{c.productCount} products</span>
                <button aria-label={`Delete ${c.title}`} onClick={() => deleteCollection(c.id)} className="grid h-10 w-10 place-items-center rounded-full text-mist transition-colors hover:bg-danger-soft hover:text-danger"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addCollection(); }}>
          <Input value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="New collection, like “New arrivals”" maxLength={80} aria-label="New collection name" />
          <Button type="submit" variant="ink" disabled={!newCol.trim()}>Add</Button>
        </form>
      </section>

      <section className="card flex items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <h2 className="panel-title">Custom domain</h2>
          <p className="mt-1 text-[14px] font-semibold text-mist">Use your own address, like yourshop.et.</p>
        </div>
        <Badge variant="neutral">Coming soon</Badge>
      </section>
    </div>
  );
}
