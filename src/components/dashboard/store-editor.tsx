"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { api, uploadImage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ShopAvatar } from "@/components/dashboard/shell";
import type { SerializedShop } from "@/server/domain/shops";

type Collection = { id: string; title: string; handle: string; productCount: number };
const SECTIONS = [
  { key: "hero", label: "Banner and tagline" },
  { key: "featured", label: "Featured collection" },
  { key: "grid", label: "All products" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
] as const;
const ACCENTS = ["#2b6cb0", "#0f766e", "#7c3aed", "#be123c", "#c2410c", "#1f2937"];

export function StoreEditor({ shop, address, bannerUrl, collections }: { shop: SerializedShop; address: string; bannerUrl: string | null; collections: Collection[] }) {
  const router = useRouter();
  const toast = useToast();
  const t = shop.settings.theme;
  const [accent, setAccent] = useState(t.accent);
  const [tagline, setTagline] = useState(t.tagline ?? "");
  const [sections, setSections] = useState<string[]>(t.sections);
  const [featured, setFeatured] = useState(t.featuredCollectionId ?? "");
  const [newCol, setNewCol] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  async function saveTheme() {
    try {
      await api(`/api/shops/${shop.handle}`, {
        method: "PATCH",
        body: { theme: { accent, tagline: tagline.trim() || null, sections, featuredCollectionId: featured || null } },
      });
      toast("Storefront updated", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    }
  }

  async function upload(kind: "logo" | "banner", file?: File) {
    if (!file) return;
    try {
      const key = await uploadImage(`/api/shops/${shop.handle}/uploads`, file);
      await api(`/api/shops/${shop.handle}/logo`, { body: { key, kind } });
      toast(kind === "logo" ? "Logo updated" : "Banner updated", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    }
  }

  async function addCollection() {
    if (!newCol.trim()) return;
    try {
      await api(`/api/shops/${shop.handle}/collections`, { body: { title: newCol.trim() } });
      setNewCol("");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create", "error");
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection? Products stay in your shop.")) return;
    await api(`/api/shops/${shop.handle}/collections/${id}`, { method: "DELETE" }).catch(() => toast("Could not delete", "error"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-mist">Your shop address</p>
          <p className="truncate font-medium">{address}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(address).then(() => toast("Address copied"))}><Copy size={14} /> Copy</Button>
        <a href={address} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-signal hover:bg-paper-muted">Open <ExternalLink size={14} /></a>
      </section>

      <section className="card space-y-5 p-4 md:p-6">
        <h2 className="text-sm font-semibold">Look</h2>
        <div className="flex flex-wrap items-center gap-4">
          <ShopAvatar shop={shop} size={56} />
          <Button size="sm" variant="secondary" onClick={() => logoRef.current?.click()}>Change logo</Button>
          <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload("logo", e.target.files?.[0])} />
        </div>
        <div>
          <div className="aspect-[8/3] w-full overflow-hidden rounded-xl" style={{ background: bannerUrl ? undefined : accent }}>
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => bannerRef.current?.click()}>Change banner</Button>
          <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload("banner", e.target.files?.[0])} />
        </div>
        <Field label="Accent colour">
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setAccent(c)} className={`h-8 w-8 rounded-full ring-offset-2 ${accent === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} placeholder="Original phones with warranty, delivered in Addis" /></Field>
        <div>
          <p className="field-label">Sections</p>
          <div className="space-y-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center justify-between text-sm">
                {s.label}
                <Switch checked={sections.includes(s.key)} onCheckedChange={(v) => setSections((xs) => (v ? SECTIONS.map((x) => x.key).filter((k) => xs.includes(k) || k === s.key) : xs.filter((k) => k !== s.key)))} />
              </label>
            ))}
          </div>
        </div>
        {sections.includes("featured") ? (
          <Field label="Featured collection">
            <Select value={featured} onChange={(e) => setFeatured(e.target.value)}>
              <option value="">Choose…</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
        ) : null}
        <Button onClick={saveTheme}>Save look</Button>
      </section>

      <section className="card space-y-3 p-4 md:p-6">
        <h2 className="text-sm font-semibold">Collections</h2>
        <p className="text-xs text-mist">Group products for your storefront. Add products from the Products page with the bulk “Add to collection” action.</p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {collections.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="flex-1">{c.title} <span className="text-mist">· {c.productCount} products</span></span>
              <button aria-label="Delete collection" onClick={() => deleteCollection(c.id)} className="text-mist hover:text-danger"><Trash2 size={15} /></button>
            </li>
          ))}
          {!collections.length ? <li className="px-3 py-3 text-sm text-mist">No collections yet.</li> : null}
        </ul>
        <div className="flex gap-2">
          <Input value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="New arrivals" maxLength={80} />
          <Button variant="secondary" onClick={addCollection}>Add</Button>
        </div>
      </section>

      <section className="card flex items-center justify-between gap-3 p-4 md:p-6">
        <div>
          <h2 className="text-sm font-semibold">Custom domain</h2>
          <p className="text-xs text-mist">Use your own address, like yourshop.et.</p>
        </div>
        <Badge variant="neutral">Coming soon</Badge>
      </section>
    </div>
  );
}
