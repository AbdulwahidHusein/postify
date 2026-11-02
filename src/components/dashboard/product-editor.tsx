"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Send, Sparkles, Trash2 } from "lucide-react";
import { api, uploadImage } from "@/lib/api-client";
import { toMajorString } from "@/lib/money";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [initial] = useState(() => JSON.stringify(f));
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
    if (!product) return;
    try {
      await api(`/api/shops/${handle}/products/${product.id}`, { method: "DELETE" });
      toast("Product deleted", "success");
      router.push(`/dashboard/${handle}/products`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete the product. Try again.", "error");
    }
  }

  const dirty = Boolean(product) && JSON.stringify(f) !== initial;
  const lowConfidence = product?.aiConfidence !== null && product?.aiConfidence !== undefined && product.aiConfidence < 0.8;
  const photoCount = images.length + pendingKeys.length;
  const busy = saving || uploading > 0;
  const cover = images.find((i) => i.thumb)?.thumb ?? pendingKeys[0]?.preview ?? null;
  const currency = product?.currency ?? "ETB";
  const STATUS = [
    { v: "published", label: "Active", hint: "Visible in your shop, Order button on posts" },
    { v: "draft", label: "Draft", hint: "Hidden from buyers" },
    { v: "sold", label: "Sold", hint: "Shown as sold, can't be ordered" },
    { v: "archived", label: "Archived", hint: "Hidden everywhere" },
  ];

  return (
    <form onSubmit={save} className={cn(dirty ? "pb-24 lg:pb-8" : "pb-8")}>
      {/* Sticky save bar — only when editing an existing product with unsaved changes */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-[60px] z-40 border-t border-white/10 bg-ink px-4 py-2.5 text-white pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:bottom-auto lg:left-[248px] lg:top-0 lg:border-t-0 lg:pb-2.5">
          <div className="mx-auto flex max-w-[1120px] items-center gap-3 lg:px-6">
            <p className="font-display text-[15px] font-bold">Unsaved changes</p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setF(JSON.parse(initial))} className="h-10 rounded-full px-4 font-display text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                Discard
              </button>
              <button type="submit" disabled={busy} className="h-10 rounded-full bg-brand px-5 font-display text-sm font-bold text-brand-fg transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:opacity-60">
                {saving ? "Saving…" : uploading ? "Uploading…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-5 sm:mb-6">
        <Link href={`/dashboard/${handle}/products`} className="mb-3 inline-flex h-10 items-center gap-2 rounded-full bg-surface pl-3 pr-4 font-display text-[13px] font-semibold text-ink transition-colors hover:bg-sunken">
          <ArrowLeft size={16} strokeWidth={2.4} /> Products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="page-title min-w-0 truncate">{product ? f.title || "Untitled product" : "Add product"}</h1>
            {product ? <ProductStatus status={product.status} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {product && product.status !== "draft" ? (
              <a href={`/s/${handle}/p/${product.slug}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
                View in shop <ArrowUpRight size={14} />
              </a>
            ) : null}
            {!product ? (
              <Button type="submit" disabled={busy}>
                {saving ? "Saving…" : uploading ? "Uploading…" : "Create product"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {lowConfidence ? (
        <div className="mb-5 flex gap-3 rounded-[20px] bg-adey-soft px-4 py-3.5 text-[15px] font-semibold text-adey-ink">
          <Sparkles size={17} className="mt-0.5 shrink-0" />
          <p><b className="font-extrabold">Read automatically from your Telegram post.</b> Check the title, price and category, then set it Active.</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className="panel space-y-4 p-4 sm:p-5">
            <Field label="Title" htmlFor="p-title"><Input id="p-title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} required placeholder="iPhone 13 Pro 128GB" /></Field>
            <Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" rows={6} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={6000} placeholder="Condition, what's included, delivery details" /></Field>
            {product?.rawCaption ? (
              <details className="group rounded-[16px] bg-sunken text-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-display font-semibold text-ink-soft">
                  <Send size={14} className="text-telegram" /> Original Telegram caption
                  <ChevronDown size={15} className="ml-auto text-faint transition-transform group-open:rotate-180" />
                </summary>
                <p className="whitespace-pre-wrap border-t border-line px-4 py-3 font-semibold text-ink-soft">{product.rawCaption}</p>
              </details>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Photos</h2>
              <span className="num text-[13px] font-bold text-mist">{photoCount} of 10 · first photo is the cover</span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images.map((img, i) => (
                  <div key={img.id} className={cn("group relative aspect-square overflow-hidden rounded-[18px] bg-sunken", i === 0 ? "col-span-2 row-span-2 ring-[3px] ring-ink" : "ring-1 ring-line")} style={{ background: img.color ?? undefined }}>
                    {img.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-xs font-medium text-mist">{img.status === "failed" ? "Couldn't process" : "Processing…"}</span>
                    )}
                    <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <PhotoButton label="Move earlier" disabled={i === 0} onClick={() => move(img.id, -1)}><ChevronLeft size={15} /></PhotoButton>
                      <PhotoButton label="Remove photo" onClick={() => removeImage(img.id)} danger><Trash2 size={14} /></PhotoButton>
                      <PhotoButton label="Move later" disabled={i === images.length - 1} onClick={() => move(img.id, 1)}><ChevronRight size={15} /></PhotoButton>
                    </div>
                    {i === 0 ? <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2.5 py-1 font-display text-[11px] font-bold text-white">Cover</span> : null}
                  </div>
                ))}
                {pendingKeys.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.key} src={p.preview} alt="" className={cn("aspect-square h-full w-full animate-pulse rounded-[18px] object-cover ring-1 ring-line", images.length === 0 && i === 0 && "col-span-2 row-span-2")} />
                ))}
                {photoCount < 10 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={cn("group/add grid aspect-square place-items-center rounded-[18px] border-2 border-dashed border-line-strong text-ink transition-colors hover:border-ink hover:bg-canvas", photoCount === 0 && "col-span-3 aspect-auto py-10 sm:col-span-4")}
                  >
                    <span className="flex flex-col items-center gap-2 font-display text-[14px] font-bold">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-fg transition-transform group-hover/add:scale-105"><ImagePlus size={20} strokeWidth={2.4} /></span>
                      {uploading ? "Uploading…" : photoCount === 0 ? "Add photos" : "Add"}
                      {photoCount === 0 ? <span className="font-sans text-xs font-semibold text-mist">JPG, PNG or WebP, up to 10</span> : null}
                    </span>
                  </button>
                ) : null}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Price and stock</h2></div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Price" htmlFor="p-price" hint="Leave empty to show “Ask for price”.">
                <Prefixed prefix={product?.currency ?? "ETB"}><Input id="p-price" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="4,500" className="num pr-20 font-display text-lg font-extrabold" /></Prefixed>
              </Field>
              <Field label="Was" htmlFor="p-compare" hint="Optional old price, shown crossed out.">
                <Prefixed prefix={product?.currency ?? "ETB"}><Input id="p-compare" inputMode="decimal" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} className="num pr-20 font-display text-lg font-extrabold" /></Prefixed>
              </Field>
              <Toggle checked={f.isNegotiable} onChange={(v) => set("isNegotiable", v)} label="Price is negotiable" hint="Buyers see “Negotiable” and are nudged to ask." />
              <div className="hidden sm:block" />
              <div className="h-px bg-line sm:col-span-2" />
              <Toggle checked={f.trackInventory} onChange={(v) => set("trackInventory", v)} label="Track stock" hint="Sells out automatically at zero and updates the Telegram button." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="In stock" htmlFor="p-qty"><Input id="p-qty" type="number" min={0} value={f.inventoryQty} disabled={!f.trackInventory} onChange={(e) => set("inventoryQty", e.target.value)} className="num" /></Field>
                <Field label="SKU" htmlFor="p-sku"><Input id="p-sku" value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={64} placeholder="Optional" /></Field>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Details</h2><span className="text-[13px] font-semibold text-mist">Helps buyers filter and search</span></div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Category"><SuggestInput kind="categories" value={f.category} onChange={(v) => set("category", v)} placeholder="Mobile Phones" /></Field>
              <Field label="Condition"><SuggestInput kind="conditions" value={f.condition} onChange={(v) => set("condition", v)} params={{ category: f.category }} placeholder="Brand New" /></Field>
              <Field label="Brand"><SuggestInput kind="brands" value={f.brand} onChange={(v) => set("brand", v)} params={{ category: f.category }} /></Field>
              <Field label="Model"><SuggestInput kind="models" value={f.model} onChange={(v) => set("model", v)} params={{ category: f.category, brand: f.brand }} /></Field>
              <Field label="Location"><SuggestInput kind="regions" value={f.location} onChange={(v) => set("location", v)} placeholder="Addis Ababa" /></Field>
              <Field label="Tags" htmlFor="p-tags" hint="Separate with commas"><Input id="p-tags" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="unlocked, dual sim" /></Field>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[var(--radius-card)] bg-ink p-4 text-white" aria-labelledby="tg-preview">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="tg-preview" className="font-display text-[15px] font-bold">How it looks in your channel</h2>
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-display text-[11px] font-bold text-white/70">Preview</span>
            </div>
            <div className="overflow-hidden rounded-[18px] bg-surface text-ink">
              <div className="grid aspect-[4/3] place-items-center bg-sunken">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={28} className="text-faint" aria-hidden />
                )}
              </div>
              <div className="space-y-1 px-3.5 py-3 text-[14px] leading-snug">
                <p className="font-bold">{f.title || "Your product title"}</p>
                <p>
                  <b className="num">{f.price ? `${f.price} ${currency}` : "Ask for price"}</b>
                  {f.compareAtPrice ? <span className="num ml-1.5 text-mist line-through">{f.compareAtPrice}</span> : null}
                  {f.isNegotiable ? <span className="ml-1.5 text-mist">· Negotiable</span> : null}
                </p>
                {f.description ? <p className="line-clamp-2 text-ink-soft">{f.description}</p> : null}
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-hidden>
              <span className="grid h-10 place-items-center rounded-[12px] bg-white/10 font-display text-[13px] font-bold">Order</span>
              <span className="grid h-10 place-items-center rounded-[12px] bg-white/10 font-display text-[13px] font-bold">Ask seller</span>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Status</h2></div>
            <fieldset className="space-y-2 p-3">
              <legend className="sr-only">Product status</legend>
              {STATUS.map((o) => (
                <label key={o.v} className={cn("flex cursor-pointer gap-3 rounded-[16px] border-2 px-3.5 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink", f.status === o.v ? "border-ink bg-surface" : "border-transparent bg-sunken hover:border-line-strong")}>
                  <input type="radio" name="status" value={o.v} checked={f.status === o.v} onChange={() => set("status", o.v)} className="sr-only" />
                  <span aria-hidden className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", f.status === o.v ? "border-ink bg-ink" : "border-line-strong bg-surface")}>
                    {f.status === o.v ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
                  </span>
                  <span>
                    <span className="block font-display text-[15px] font-bold">{o.label}</span>
                    <span className="block text-[13px] font-semibold text-mist">{o.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          {product ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title flex items-center gap-2"><Send size={15} className="text-telegram" /> Telegram</h2>
              </div>
              <div className="space-y-3 p-4">
                {sources.length ? (
                  <ul className="space-y-2">
                    {sources.map((s) => {
                      const bad = s.buttonStatus === "failed" || s.buttonStatus === "deleted";
                      return (
                        <li key={s.id} className="rounded-[16px] bg-sunken px-3.5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-display text-sm font-bold">{s.channel?.title ?? "Telegram chat"}</span>
                            {s.link ? <a href={s.link} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-telegram hover:underline">Open post</a> : null}
                          </div>
                          <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs", bad ? "font-medium text-danger" : "text-mist")}>
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", bad ? "bg-danger" : s.buttonMode === "none" ? "bg-faint" : "bg-success-dot")} />
                            {s.buttonStatus === "deleted" ? "Post was deleted" : s.buttonStatus === "failed" ? `Button problem: ${s.lastError ?? "unknown"}` : s.buttonMode === "reply_card" ? "Order button in a card under the post" : s.buttonMode === "none" ? "No button while hidden" : "Order button on the post"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-mist">Not in any Telegram post yet.</p>
                )}
                {channels.length && product.status === "published" ? (
                  <div className="space-y-2 border-t border-line pt-3">
                    <p className="text-[14px] font-extrabold">Post it to a channel</p>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1"><Select value={postChannel} onChange={(e) => setPostChannel(e.target.value)} className="h-11" aria-label="Channel">
                        {channels.map((c) => <option key={c.id} value={c.id}>{c.title ?? c.chatType}</option>)}
                      </Select></div>
                      <Button type="button" variant="telegram" onClick={postToChannel}>Post</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {product ? (
            <button type="button" onClick={() => setDeleteOpen(true)} className="flex h-11 w-full items-center justify-center gap-2 rounded-full font-display text-sm font-bold text-danger transition-colors hover:bg-danger-soft">
              <Trash2 size={15} /> Delete product
            </button>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this product?"
        description="If it's posted in Telegram, it's archived instead and its Order button is removed."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>Keep it</Button>
            <Button type="button" variant="danger-solid" onClick={remove}>Delete product</Button>
          </>
        }
      >
        <p className="text-sm text-mist">{f.title}</p>
      </Dialog>
    </form>
  );
}

function PhotoButton({ label, danger, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...props} className={cn("grid h-8 w-8 place-items-center rounded-full bg-surface/95 shadow-sm transition-transform active:scale-95 disabled:opacity-0", danger ? "text-danger" : "text-ink")}>
      {children}
    </button>
  );
}

function Prefixed({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute right-2 top-1/2 grid h-8 -translate-y-1/2 place-items-center rounded-[12px] bg-ink px-2.5 font-display text-[13px] font-bold text-brand">{prefix}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block font-display text-[15px] font-bold">{label}</span>
        {hint ? <span className="block text-[13px] font-semibold text-mist">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}
