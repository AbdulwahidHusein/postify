"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Send, Trash2 } from "lucide-react";
import { api, uploadImage } from "@/lib/api-client";
import { toMajorString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ProductStatus } from "@/components/status";
import { useToast } from "@/components/ui/toast";
import { SuggestInput } from "@/components/dashboard/suggest-input";

type Img = { id: string; status: string; thumb: string | null; color: string | null };
export type EditorProduct = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  location: string | null;
  tags: string[];
  isNegotiable: boolean;
  status: string;
  priceMinor: string | null;
  compareAtMinor: string | null;
  currency: string;
  inventoryQty: number;
  trackInventory: boolean;
  variants: { sku: string | null }[];
  images: Img[];
  rawCaption: string | null;
  aiConfidence: number | null;
};
type Source = { id: string; channel: { title: string | null } | null; buttonMode: string; buttonStatus: string; lastError: string | null; link: string | null };
type Channel = { id: string; title: string | null; chatType: string };

const major = (m: string | null) => (m ? toMajorString(m) : "");

export function ProductEditor({
  handle,
  product,
  sources = [],
  channels = [],
}: {
  handle: string;
  product: EditorProduct | null;
  sources?: Source[];
  channels?: Channel[];
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    title: product?.title ?? "",
    description: product?.description ?? "",
    price: major(product?.priceMinor ?? null),
    compareAtPrice: major(product?.compareAtMinor ?? null),
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    model: product?.model ?? "",
    condition: product?.condition ?? "",
    location: product?.location ?? "",
    tags: (product?.tags ?? []).join(", "),
    sku: product?.variants[0]?.sku ?? "",
    isNegotiable: product?.isNegotiable ?? false,
    trackInventory: product?.trackInventory ?? true,
    inventoryQty: String(product?.inventoryQty ?? 1),
    status: product?.status ?? "published",
  });
  const [images, setImages] = useState<Img[]>(product?.images ?? []);
  const [pendingKeys, setPendingKeys] = useState<{ key: string; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [postChannel, setPostChannel] = useState(channels[0]?.id ?? "");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function payload() {
    const qty = Number(f.inventoryQty);
    return {
      title: f.title.trim(),
      description: f.description.trim() || null,
      price: f.price.trim() || null,
      compareAtPrice: f.compareAtPrice.trim() || null,
      category: f.category.trim() || null,
      brand: f.brand.trim() || null,
      model: f.model.trim() || null,
      condition: f.condition.trim() || null,
      location: f.location.trim() || null,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12),
      sku: f.sku.trim() || null,
      isNegotiable: f.isNegotiable,
      trackInventory: f.trackInventory,
      inventoryQty: Number.isFinite(qty) && qty >= 0 ? Math.floor(qty) : 0,
      status: f.status,
    };
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.title.trim()) return toast("Add a title", "error");
    setSaving(true);
    try {
      if (product) {
        await api(`/api/shops/${handle}/products/${product.id}`, { method: "PATCH", body: payload() });
        toast("Saved. Telegram buttons update in a few seconds.", "success");
        router.refresh();
      } else {
        const { product: created } = await api<{ product: { id: string } }>(`/api/shops/${handle}/products`, {
          body: { ...payload(), imageKeys: pendingKeys.map((k) => k.key) },
        });
        toast("Product created", "success");
        router.push(`/dashboard/${handle}/products/${created.id}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, 10 - images.length - pendingKeys.length);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const key = await uploadImage(`/api/shops/${handle}/uploads`, file);
        if (product) {
          const { image } = await api<{ image: Img }>(`/api/shops/${handle}/products/${product.id}/images`, { body: { key } });
          setImages((xs) => [...xs, { ...image, thumb: URL.createObjectURL(file) }]);
        } else {
          setPendingKeys((xs) => [...xs, { key, preview: URL.createObjectURL(file) }]);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Upload failed", "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removeImage(id: string) {
    if (!product) return;
    try {
      await api(`/api/shops/${handle}/products/${product.id}/images/${id}`, { method: "DELETE" });
      setImages((xs) => xs.filter((x) => x.id !== id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove the image", "error");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    if (!product) return;
    const i = images.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
    await api(`/api/shops/${handle}/products/${product.id}/images`, { method: "PATCH", body: { order: next.map((x) => x.id) } }).catch(() =>
      toast("Could not reorder", "error"),
    );
  }

  async function postToChannel() {
    if (!product || !postChannel) return;
    try {
      await api(`/api/shops/${handle}/products/${product.id}/publish`, { body: { channelId: postChannel } });
      toast("Posted to Telegram", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not post", "error");
    }
  }

  async function remove() {
    if (!product || !confirm("Delete this product? If it's posted in Telegram it will be archived and its buttons removed.")) return;
    try {
      await api(`/api/shops/${handle}/products/${product.id}`, { method: "DELETE" });
      router.push(`/dashboard/${handle}/products`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    }
  }

  return (
    <form onSubmit={save} className="pb-20">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/dashboard/${handle}/products`} className="mb-1 inline-flex items-center gap-1 text-sm text-mist hover:text-ink">
            <ChevronLeft size={16} /> Products
          </Link>
          <h1 className="page-title flex items-center gap-2 truncate">
            {product ? f.title || "Untitled" : "Add product"} {product ? <ProductStatus status={product.status} /> : null}
          </h1>
        </div>
        <div className="flex gap-2">
          {product && product.status !== "draft" ? (
            <a href={`/s/${handle}/p/${product.slug}`} target="_blank" className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-mist hover:bg-paper-muted">
              View <ExternalLink size={14} />
            </a>
          ) : null}
          <Button type="submit" disabled={saving || uploading > 0}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="card space-y-4 p-4">
            <Field label="Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} required /></Field>
            <Field label="Description"><Textarea rows={6} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={6000} /></Field>
            {product?.rawCaption ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-mist">Original Telegram caption</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper-muted p-3 text-sm">{product.rawCaption}</p>
              </details>
            ) : null}
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Photos</h2>
              <span className="text-xs text-mist">{images.length + pendingKeys.length}/10</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((img, i) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg" style={{ background: img.color ?? "var(--paper-muted)" }}>
                  {img.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-xs text-mist">{img.status === "failed" ? "Failed" : "Processing…"}</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-ink/60 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => move(img.id, -1)} className="rounded bg-white/90 p-0.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
                    <button type="button" aria-label="Delete photo" onClick={() => removeImage(img.id)} className="rounded bg-white/90 p-0.5 text-danger"><Trash2 size={14} /></button>
                    <button type="button" aria-label="Move right" disabled={i === images.length - 1} onClick={() => move(img.id, 1)} className="rounded bg-white/90 p-0.5 disabled:opacity-40"><ChevronRight size={14} /></button>
                  </div>
                  {i === 0 ? <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] font-semibold">Cover</span> : null}
                </div>
              ))}
              {pendingKeys.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.key} src={p.preview} alt="" className="aspect-square rounded-lg object-cover" />
              ))}
              {images.length + pendingKeys.length < 10 ? (
                <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-line-strong text-mist hover:border-signal hover:text-signal">
                  <span className="flex flex-col items-center gap-1 text-xs">
                    <ImagePlus size={20} />
                    {uploading ? "Uploading…" : "Add"}
                  </span>
                </button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          </section>

          <section className="card grid gap-4 p-4 sm:grid-cols-2">
            <h2 className="text-sm font-semibold sm:col-span-2">Pricing &amp; stock</h2>
            <Field label="Price" hint="Leave empty to show “Ask for price”.">
              <Input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="4500" />
            </Field>
            <Field label="Compare-at price" hint="Optional old price, shown crossed out.">
              <Input inputMode="decimal" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} />
            </Field>
            <Field label="Quantity in stock">
              <Input type="number" min={0} value={f.inventoryQty} disabled={!f.trackInventory} onChange={(e) => set("inventoryQty", e.target.value)} />
            </Field>
            <Field label="SKU"><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={64} /></Field>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Switch checked={f.trackInventory} onCheckedChange={(v) => set("trackInventory", v)} /> Track stock (sold out at 0)
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Switch checked={f.isNegotiable} onCheckedChange={(v) => set("isNegotiable", v)} /> Price is negotiable
            </label>
          </section>

          <section className="card grid gap-4 p-4 sm:grid-cols-2">
            <h2 className="text-sm font-semibold sm:col-span-2">Details</h2>
            <Field label="Category"><SuggestInput kind="categories" value={f.category} onChange={(v) => set("category", v)} placeholder="Mobile Phones" /></Field>
            <Field label="Condition"><SuggestInput kind="conditions" value={f.condition} onChange={(v) => set("condition", v)} params={{ category: f.category }} placeholder="Brand New" /></Field>
            <Field label="Brand"><SuggestInput kind="brands" value={f.brand} onChange={(v) => set("brand", v)} params={{ category: f.category }} /></Field>
            <Field label="Model"><SuggestInput kind="models" value={f.model} onChange={(v) => set("model", v)} params={{ category: f.category, brand: f.brand }} /></Field>
            <Field label="Location"><SuggestInput kind="regions" value={f.location} onChange={(v) => set("location", v)} placeholder="Addis Ababa" /></Field>
            <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} /></Field>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Status</h2>
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="published">Active (visible)</option>
              <option value="draft">Draft (hidden)</option>
              <option value="sold">Sold</option>
              <option value="archived">Archived</option>
            </Select>
            {product?.aiConfidence !== null && product?.aiConfidence !== undefined && product.aiConfidence < 0.8 ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Read automatically from your post. Please check the title and price.</p>
            ) : null}
          </section>

          {product ? (
            <section className="card space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Send size={15} /> Telegram</h2>
              {sources.length ? (
                <ul className="space-y-2 text-sm">
                  {sources.map((s) => (
                    <li key={s.id} className="rounded-lg bg-paper-muted px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{s.channel?.title ?? "Chat"}</span>
                        {s.link ? <a href={s.link} target="_blank" className="text-signal"><ExternalLink size={14} /></a> : null}
                      </div>
                      <p className="text-xs text-mist">
                        {s.buttonStatus === "deleted" ? "Post deleted" : s.buttonStatus === "failed" ? `Button problem: ${s.lastError ?? "unknown"}` : s.buttonMode === "reply_card" ? "Order button in a card under the post" : s.buttonMode === "none" ? "No buttons (draft)" : "Order button on the post"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-mist">Not posted in Telegram yet.</p>
              )}
              {channels.length && product.status === "published" ? (
                <div className="flex gap-2">
                  <Select value={postChannel} onChange={(e) => setPostChannel(e.target.value)} className="h-9">
                    {channels.map((c) => <option key={c.id} value={c.id}>{c.title ?? c.chatType}</option>)}
                  </Select>
                  <Button type="button" size="sm" variant="secondary" onClick={postToChannel}>Post</Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {product ? (
            <Button type="button" variant="danger" fullWidth onClick={remove}><Trash2 size={16} /> Delete product</Button>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
