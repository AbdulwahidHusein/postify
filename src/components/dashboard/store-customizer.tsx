"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, Eye, EyeOff, GripVertical, ImagePlus, Laptop, Loader2, Plus, Redo2, Smartphone, Trash2, Undo2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, uploadImage } from "@/lib/api-client";
import {
  PRESET_THEMES, PRESETS, SECTION_INFO, blankSection, contrastRatio, readableOn,
  type SectionOf, type SectionType, type StoreDesign, type StoreLink, type StoreSection, type StoreTheme,
} from "@/lib/store-design";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

type Props = {
  handle: string;
  shopName: string;
  previewSrc: string;
  liveUrl: string;
  initial: StoreDesign;
  hasDraft: boolean;
  imageUrls: Record<string, string>;
  collections: { id: string; handle: string; title: string }[];
  categories: string[];
  logoUrl: string | null;
  hasChannel: boolean;
};

type Tab = "sections" | "theme" | "menu";
type SaveState = "idle" | "saving" | "saved" | "error";

const ACCENTS = ["#ff5a36", "#2f5bff", "#0f766e", "#6d2e66", "#a3281b", "#8a6100", "#c8f03c", "#1c1917"];

const WIDE = "(min-width: 1280px)";
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export function StoreCustomizer(p: Props) {
  const toast = useToast();
  const wide = useWide();
  const [design, setDesign] = useState<StoreDesign>(p.initial);
  const [past, setPast] = useState<StoreDesign[]>([]);
  const [future, setFuture] = useState<StoreDesign[]>([]);
  const lastPush = useRef(0);
  const [tab, setTab] = useState<Tab>("sections");
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [save, setSave] = useState<SaveState>("idle");
  const [unpublished, setUnpublished] = useState(p.hasDraft);
  const [publishing, setPublishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [images, setImages] = useState(p.imageUrls);
  const frame = useRef<HTMLIFrameElement>(null);
  /** The design as last saved on the server, so we only save real changes. */
  const saved = useRef(JSON.stringify(p.initial));

  const post = useCallback((msg: object) => frame.current?.contentWindow?.postMessage(msg, window.location.origin), []);

  /** Every edit goes through here: one undo step per burst of typing. */
  const update = useCallback((fn: (d: StoreDesign) => StoreDesign) => {
    setDesign((cur) => {
      const next = fn(cur);
      const now = Date.now();
      if (now - lastPush.current > 800) setPast((ps) => [...ps.slice(-49), cur]);
      lastPush.current = now;
      setFuture([]);
      return next;
    });
  }, []);

  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [design, ...f]);
    setDesign(past[past.length - 1]);
    setPast((ps) => ps.slice(0, -1));
    lastPush.current = 0;
  };
  const redo = () => {
    if (!future.length) return;
    setPast((ps) => [...ps, design]);
    setDesign(future[0]);
    setFuture((f) => f.slice(1));
    lastPush.current = 0;
  };

  // Autosave the draft, then refresh the preview frame.
  useEffect(() => {
    const json = JSON.stringify(design);
    if (json === saved.current) return;
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        await api(`/api/shops/${p.handle}/design`, { method: "PUT", body: { design } });
        saved.current = json;
        setSave("saved");
        setUnpublished(true);
        post({ type: "goods:refresh" });
      } catch (err) {
        setSave("error");
        toast(err instanceof Error ? err.message : "Couldn't save your changes", "error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [design, p.handle, post, toast]);

  // Messages from the preview frame.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as { type?: string; id?: string };
      if (msg?.type === "goods:pick" && msg.id) {
        setSelected(msg.id);
        setTab("sections");
      }
      if (msg?.type === "goods:ready" && selected) post({ type: "goods:select", id: selected });
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [post, selected]);

  useEffect(() => {
    if (selected) post({ type: "goods:select", id: selected });
  }, [selected, post]);

  async function publish() {
    setPublishing(true);
    try {
      await api(`/api/shops/${p.handle}/design`, { method: "PUT", body: { design } });
      await api(`/api/shops/${p.handle}/design`, { body: { action: "publish" } });
      setUnpublished(false);
      toast("Your store is live with these changes", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't publish", "error");
    } finally {
      setPublishing(false);
    }
  }

  async function discard() {
    if (!confirm("Discard all unpublished changes?")) return;
    try {
      const res = await api<{ published: StoreDesign }>(`/api/shops/${p.handle}/design`, { body: { action: "discard" } });
      saved.current = JSON.stringify(res.published);
      setDesign(res.published);
      setPast([]);
      setFuture([]);
      setUnpublished(false);
      setSave("idle");
      post({ type: "goods:refresh" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't discard", "error");
    }
  }

  const setSection = (id: string, fn: (s: StoreSection) => StoreSection) =>
    update((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? fn(s) : s)) }));
  const move = (id: string, by: -1 | 1) =>
    update((d) => {
      const i = d.sections.findIndex((s) => s.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.sections.length) return d;
      const xs = [...d.sections];
      [xs[i], xs[j]] = [xs[j], xs[i]];
      return { ...d, sections: xs };
    });
  const remove = (id: string) => {
    update((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }));
    setSelected(null);
  };
  const add = (type: SectionType) => {
    const s = blankSection(type);
    update((d) => {
      const at = selected ? d.sections.findIndex((x) => x.id === selected) + 1 : d.sections.length;
      const xs = [...d.sections];
      xs.splice(at > 0 ? at : xs.length, 0, s);
      return { ...d, sections: xs };
    });
    setAdding(false);
    setSelected(s.id);
  };

  // Drag to reorder (mouse); arrow buttons cover keyboard and touch.
  const dragId = useRef<string | null>(null);
  const onDrop = (target: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === target) return;
    update((d) => {
      const xs = [...d.sections];
      const i = xs.findIndex((s) => s.id === from);
      const [item] = xs.splice(i, 1);
      xs.splice(xs.findIndex((s) => s.id === target), 0, item);
      return { ...d, sections: xs };
    });
  };

  const current = design.sections.find((s) => s.id === selected) ?? null;

  const uploadSectionImage = async (file: File, shape: "banner" | "square" = "banner") => {
    const original = await uploadImage(`/api/shops/${p.handle}/uploads`, file);
    const res = await api<{ key: string; url: string }>(`/api/shops/${p.handle}/design/image`, { body: { key: original, shape } });
    setImages((m) => ({ ...m, [res.key]: res.url }));
    return res.key;
  };

  const ctx: FormCtx = { collections: p.collections, categories: p.categories, hasChannel: p.hasChannel, images, upload: uploadSectionImage };

  const saveLabel = save === "saving" ? "Saving…" : save === "error" ? "Not saved, retrying on next change" : unpublished ? "Unpublished changes" : "Everything is live";

  const sectionsList = (
    <div className="space-y-1.5">
      {design.sections.map((s, i) => {
        const on = s.id === selected;
        return (
          <div
            key={s.id}
            draggable
            onDragStart={() => (dragId.current = s.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(s.id)}
            className={cn("group flex min-h-12 items-center gap-1.5 rounded-[16px] pl-1.5 pr-1.5 transition-colors", on ? "bg-ink text-white" : "hover:bg-sunken")}
          >
            <GripVertical size={16} aria-hidden className={cn("shrink-0 cursor-grab", on ? "text-white/50" : "text-faint")} />
            <button type="button" onClick={() => setSelected(on ? null : s.id)} aria-pressed={on} className={cn("min-w-0 flex-1 truncate py-3 text-left font-display text-[14px] font-semibold", s.hidden && "opacity-50")}>
              {sectionName(s, p.collections)}
            </button>
            <span className="flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
              <IconBtn label="Move up" onClick={() => move(s.id, -1)} disabled={i === 0} dark={on}><ArrowUp size={15} /></IconBtn>
              <IconBtn label="Move down" onClick={() => move(s.id, 1)} disabled={i === design.sections.length - 1} dark={on}><ArrowDown size={15} /></IconBtn>
            </span>
            <IconBtn label={s.hidden ? "Show section" : "Hide section"} onClick={() => setSection(s.id, (x) => ({ ...x, hidden: !x.hidden }))} dark={on}>
              {s.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </IconBtn>
          </div>
        );
      })}
      <button type="button" onClick={() => setAdding(true)} className="mt-2 flex h-12 w-full items-center justify-center gap-2.5 rounded-[16px] border-2 border-dashed border-line-strong font-display text-[14px] font-bold transition-colors hover:border-ink">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-brand-fg"><Plus size={15} strokeWidth={2.8} /></span>
        Add section
      </button>
    </div>
  );

  const settingsPanel = current ? (
    <SectionForm key={current.id} s={current} ctx={ctx} onChange={(fn) => setSection(current.id, fn)} onRemove={() => remove(current.id)} />
  ) : (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <p className="font-display text-lg font-bold">Pick a section to edit</p>
        <p className="mt-1 text-sm font-semibold text-mist">Click it in the list or right in the preview.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
        <Link href={`/dashboard/${p.handle}/store`} aria-label="Exit editor" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sunken"><ArrowLeft size={18} strokeWidth={2.4} /></Link>
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-extrabold tracking-[-0.02em]">{p.shopName}</p>
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-mist" aria-live="polite">
            {save === "saving" ? <Loader2 size={12} className="animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", save === "error" ? "bg-danger" : unpublished ? "bg-adey" : "bg-success-dot")} />}
            <span className="truncate">{saveLabel}</span>
          </p>
        </div>
        <div className="flex-1" />
        <div role="group" aria-label="Preview size" className="hidden rounded-full bg-sunken p-1 lg:flex">
          {(["desktop", "phone"] as const).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} aria-label={d === "desktop" ? "Desktop preview" : "Phone preview"} onClick={() => setDevice(d)} className={cn("grid h-9 w-11 place-items-center rounded-full transition-colors", device === d ? "bg-ink text-white" : "text-ink")}>
              {d === "desktop" ? <Laptop size={17} /> : <Smartphone size={17} />}
            </button>
          ))}
        </div>
        <IconBtn label="Undo" onClick={undo} disabled={!past.length} big><Undo2 size={17} /></IconBtn>
        <IconBtn label="Redo" onClick={redo} disabled={!future.length} big><Redo2 size={17} /></IconBtn>
        {unpublished ? <Button variant="ghost" className="hidden sm:inline-flex" onClick={discard}>Discard</Button> : null}
        <a href={p.liveUrl} target="_blank" rel="noreferrer" className="hidden h-11 items-center rounded-full border-2 border-ink px-4 font-display text-[14px] font-bold md:inline-flex">View live</a>
        <Button onClick={publish} disabled={publishing || save === "saving" || (!unpublished && save !== "saved")}>{publishing ? "Publishing…" : "Publish"}</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className={cn("w-full shrink-0 flex-col border-r border-line bg-surface lg:flex lg:w-[320px]", mobileView === "edit" ? "flex" : "hidden")} aria-label="Store editor">
          <div role="tablist" aria-label="Editor panels" className="m-3 flex rounded-full bg-sunken p-1">
            {(["sections", "theme", "menu"] as const).map((x) => (
              <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setTab(x)} className={cn("h-10 flex-1 rounded-full font-display text-[14px] font-semibold capitalize transition-colors", tab === x ? "bg-surface font-bold shadow-[0_1px_3px_rgb(17_17_17/0.12)]" : "text-mist")}>
                {x === "menu" ? "Menu & bar" : x}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 lg:pb-6">
            {tab === "sections" ? sectionsList : tab === "theme" ? <ThemeForm theme={design.theme} logoUrl={p.logoUrl} handle={p.handle} onChange={(th) => update((d) => ({ ...d, theme: th }))} /> : <MenuForm design={design} ctx={ctx} update={update} />}
          </div>
        </aside>

        {/* Preview */}
        <main className={cn("min-w-0 flex-1 flex-col items-center overflow-hidden bg-[#efe8e3] p-0 lg:flex lg:p-5", mobileView === "preview" ? "flex" : "hidden")} aria-label="Live preview">
          <div className={cn("relative h-full overflow-hidden bg-surface transition-[width] duration-300", device === "phone" ? "w-[390px] rounded-[36px] shadow-[0_0_0_8px_#111,0_24px_60px_rgb(17_17_17/0.25)]" : "w-full lg:rounded-[18px] lg:shadow-[0_20px_50px_rgb(17_17_17/0.14)]")}>
            <iframe ref={frame} src={p.previewSrc} title="Store preview" className="h-full w-full border-0" onLoad={() => selected && post({ type: "goods:select", id: selected })} />
          </div>
        </main>

        {/* Right panel (desktop) */}
        {tab === "sections" ? (
          <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-line bg-surface xl:block" aria-label="Section settings">{settingsPanel}</aside>
        ) : null}
      </div>

      {/* Phones and laptops: edit/preview switch, and section settings in a sheet */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <div role="group" aria-label="Editor view" className="flex rounded-full bg-ink p-1 shadow-float">
          {(["edit", "preview"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={mobileView === v} onClick={() => setMobileView(v)} className={cn("h-11 rounded-full px-5 font-display text-[14px] font-bold capitalize", mobileView === v ? "bg-brand text-brand-fg" : "text-white")}>{v}</button>
          ))}
        </div>
      </div>
      <div>
        <Dialog open={Boolean(current) && tab === "sections" && !wide} onOpenChange={(o) => !o && setSelected(null)} title={current ? SECTION_INFO[current.type].label : ""}>
          {current ? <SectionForm key={current.id} s={current} ctx={ctx} onChange={(fn) => setSection(current.id, fn)} onRemove={() => remove(current.id)} bare /> : null}
        </Dialog>
      </div>

      <Dialog open={adding} onOpenChange={setAdding} title="Add a section" description={selected ? "It goes below the section you have selected." : "It goes at the end of the page."} className="sm:max-w-3xl">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(SECTION_INFO) as SectionType[]).map((type) => {
            const info = SECTION_INFO[type];
            const taken = !info.multiple && design.sections.some((s) => s.type === type);
            return (
              <button key={type} type="button" disabled={taken} onClick={() => add(type)} className="flex items-start gap-3 rounded-[18px] border-2 border-line p-3.5 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-45">
                <SectionThumb type={type} />
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-bold">{info.label}</span>
                  <span className="block text-[13px] font-semibold text-mist">{taken ? "Already on your page" : info.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────

function IconBtn({ label, onClick, disabled, dark, big, children }: { label: string; onClick: () => void; disabled?: boolean; dark?: boolean; big?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("grid shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30", big ? "h-11 w-11" : "h-9 w-9", dark ? "hover:bg-white/15" : "hover:bg-sunken")}>
      {children}
    </button>
  );
}

function sectionName(s: StoreSection, cols: Props["collections"]) {
  const base = SECTION_INFO[s.type].label;
  if (s.type === "featured") return s.title || cols.find((c) => c.id === s.collectionId)?.title || "Newest products";
  if (s.type === "promo" && s.heading) return `Promo: ${s.heading}`;
  if ((s.type === "hero" || s.type === "faq" || s.type === "story") && "title" in s && s.title) return s.title;
  if (s.type === "hero" && s.heading) return `Banner: ${s.heading}`;
  return base;
}

function SectionThumb({ type }: { type: SectionType }) {
  const box = "h-14 w-20 shrink-0 rounded-[12px] bg-sunken p-2";
  const bar = (w: string, c = "bg-line-strong") => <span className={cn("block h-1.5 rounded-full", c)} style={{ width: w }} />;
  switch (type) {
    case "hero": return <span className={cn(box, "grid grid-cols-2 gap-1")}><span className="flex flex-col justify-center gap-1">{bar("90%", "bg-ink")}{bar("60%", "bg-ink")}{bar("50%", "bg-brand")}</span><span className="rounded-md bg-line-strong" /></span>;
    case "promo": return <span className={cn(box, "flex flex-col justify-center gap-1.5 bg-brand")}>{bar("70%", "bg-ink")}<span className="flex gap-1"><span className="h-3 w-4 rounded bg-white" /><span className="h-3 w-4 rounded bg-white" /><span className="h-3 w-4 rounded bg-white" /></span></span>;
    case "categories": return <span className={cn(box, "flex items-center justify-between")}>{[0, 1, 2].map((i) => <span key={i} className="h-5 w-5 rounded-full bg-line-strong" />)}</span>;
    case "telegram": return <span className={cn(box, "flex items-center gap-1.5 bg-telegram-soft")}><span className="h-5 w-5 rounded-full bg-telegram" />{bar("50%", "bg-telegram")}</span>;
    case "faq": return <span className={cn(box, "flex flex-col justify-center gap-1")}>{[0, 1, 2].map((i) => <span key={i} className="h-2.5 rounded bg-surface" />)}</span>;
    case "trust": return <span className={cn(box, "grid grid-cols-3 gap-1")}>{[0, 1, 2].map((i) => <span key={i} className="rounded bg-success-soft" />)}</span>;
    default: return <span className={cn(box, "grid grid-cols-3 gap-1")}>{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="rounded bg-line-strong" />)}</span>;
  }
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-[18px] bg-sunken p-1">
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={cn("h-10 min-w-0 flex-1 rounded-[14px] px-3 font-display text-[13px] font-semibold transition-colors", value === o.v ? "bg-surface font-bold shadow-[0_1px_3px_rgb(17_17_17/0.12)]" : "text-mist hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type FormCtx = {
  collections: Props["collections"];
  categories: string[];
  hasChannel: boolean;
  images: Record<string, string>;
  upload: (file: File, shape?: "banner" | "square") => Promise<string>;
};

function LinkPicker({ value, onChange, ctx, label = "Button goes to" }: { value: StoreLink; onChange: (l: StoreLink) => void; ctx: FormCtx; label?: string }) {
  const kinds: { v: StoreLink["kind"]; label: string }[] = [
    { v: "all", label: "All products" },
    ...(ctx.categories.length ? [{ v: "category" as const, label: "A category" }] : []),
    ...(ctx.collections.length ? [{ v: "collection" as const, label: "A collection" }] : []),
    ...(ctx.hasChannel ? [{ v: "telegram" as const, label: "Telegram channel" }] : []),
    { v: "url", label: "Web address" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={label}>
        <Select value={value.kind} onChange={(e) => onChange({ kind: e.target.value as StoreLink["kind"], value: "" })}>
          {kinds.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
        </Select>
      </Field>
      {value.kind === "category" ? (
        <Field label="Category">
          <Select value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })}>
            <option value="">Choose…</option>
            {ctx.categories.map((c) => <option key={c} value={c}>{c.split(" > ").at(-1)}</option>)}
          </Select>
        </Field>
      ) : value.kind === "collection" ? (
        <Field label="Collection">
          <Select value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })}>
            <option value="">Choose…</option>
            {ctx.collections.map((c) => <option key={c.id} value={c.handle}>{c.title}</option>)}
          </Select>
        </Field>
      ) : value.kind === "url" ? (
        <Field label="Address"><Input value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} placeholder="https://" inputMode="url" /></Field>
      ) : null}
    </div>
  );
}

function ImagePicker({ value, onChange, ctx, shape = "banner", label = "Image" }: { value: string | null; onChange: (k: string | null) => void; ctx: FormCtx; shape?: "banner" | "square"; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const url = value ? ctx.images[value] : null;
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex items-center gap-3 rounded-[18px] bg-sunken p-2.5">
        <span className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} className="text-faint" />}
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <Button type="button" size="sm" variant="ink" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : value ? "Replace" : "Upload"}</Button>
          {value ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button> : null}
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await ctx.upload(f, shape));
          } catch (err) {
            toast(err instanceof Error ? err.message : "Upload failed", "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ── section settings ─────────────────────────────────────────────────────────

function SectionForm({ s, ctx, onChange, onRemove, bare }: { s: StoreSection; ctx: FormCtx; onChange: (fn: (s: StoreSection) => StoreSection) => void; onRemove: () => void; bare?: boolean }) {
  const set = <T extends StoreSection>(patch: Partial<T>) => onChange((x) => ({ ...x, ...patch }) as StoreSection);
  let body: ReactNode = null;
  switch (s.type) {
    case "hero":
      body = (
        <>
          <Segmented label="Layout" value={s.layout} onChange={(v) => set<SectionOf<"hero">>({ layout: v })} options={[{ v: "split", label: "Split" }, { v: "image", label: "Full image" }, { v: "text", label: "Text only" }]} />
          {s.layout !== "text" ? <ImagePicker value={s.imageKey} onChange={(k) => set<SectionOf<"hero">>({ imageKey: k })} ctx={ctx} /> : null}
          <Field label="Heading"><Input value={s.heading} maxLength={90} onChange={(e) => set<SectionOf<"hero">>({ heading: e.target.value })} /></Field>
          <Field label="Text"><Textarea rows={3} value={s.text} maxLength={240} onChange={(e) => set<SectionOf<"hero">>({ text: e.target.value })} /></Field>
          <Field label="Button text" hint="Leave empty for no button."><Input value={s.buttonLabel} maxLength={32} onChange={(e) => set<SectionOf<"hero">>({ buttonLabel: e.target.value })} /></Field>
          {s.buttonLabel ? <LinkPicker value={s.link} onChange={(l) => set<SectionOf<"hero">>({ link: l })} ctx={ctx} /> : null}
          {s.layout !== "image" ? <Segmented label="Background" value={s.background} onChange={(v) => set<SectionOf<"hero">>({ background: v })} options={[{ v: "tint", label: "Soft" }, { v: "accent", label: "Brand" }, { v: "dark", label: "Dark" }, { v: "plain", label: "White" }]} /> : null}
          <Segmented label="Height" value={s.height} onChange={(v) => set<SectionOf<"hero">>({ height: v })} options={[{ v: "s", label: "Small" }, { v: "m", label: "Medium" }, { v: "l", label: "Large" }]} />
        </>
      );
      break;
    case "categories":
      body = (
        <>
          <Field label="Title" hint="Empty shows “Shop by category”."><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"categories">>({ title: e.target.value })} /></Field>
          <Segmented label="Style" value={s.style} onChange={(v) => set<SectionOf<"categories">>({ style: v })} options={[{ v: "circles", label: "Circles" }, { v: "tiles", label: "Tiles" }]} />
          {ctx.categories.length < 2 ? <Note>Shows once you have products in at least two categories.</Note> : null}
        </>
      );
      break;
    case "featured":
      body = (
        <>
          <Field label="Products">
            <Select value={s.collectionId ?? ""} onChange={(e) => set<SectionOf<"featured">>({ collectionId: e.target.value || null })}>
              <option value="">Newest products</option>
              {ctx.collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"featured">>({ title: e.target.value })} placeholder="New arrivals" /></Field>
          <Segmented label="How many" value={String(s.limit) as "4" | "8" | "12"} onChange={(v) => set<SectionOf<"featured">>({ limit: Number(v) })} options={[{ v: "4", label: "4" }, { v: "8", label: "8" }, { v: "12", label: "12" }]} />
        </>
      );
      break;
    case "grid":
      body = (
        <>
          <Field label="Title" hint="Optional. Search and category chips are always on."><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"grid">>({ title: e.target.value })} /></Field>
        </>
      );
      break;
    case "promo": {
      const local = s.endsAt ? toLocalInput(s.endsAt) : "";
      body = (
        <>
          <Field label="Heading"><Input value={s.heading} maxLength={90} onChange={(e) => set<SectionOf<"promo">>({ heading: e.target.value })} /></Field>
          <Field label="Text"><Textarea rows={2} value={s.text} maxLength={200} onChange={(e) => set<SectionOf<"promo">>({ text: e.target.value })} /></Field>
          <Field label="Ends" hint="The countdown shows to buyers and the banner hides itself after this time.">
            <Input type="datetime-local" value={local} onChange={(e) => set<SectionOf<"promo">>({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </Field>
          <Field label="Button text"><Input value={s.buttonLabel} maxLength={32} onChange={(e) => set<SectionOf<"promo">>({ buttonLabel: e.target.value })} /></Field>
          {s.buttonLabel ? <LinkPicker value={s.link} onChange={(l) => set<SectionOf<"promo">>({ link: l })} ctx={ctx} /> : null}
          <Segmented label="Background" value={s.background} onChange={(v) => set<SectionOf<"promo">>({ background: v })} options={[{ v: "accent", label: "Brand" }, { v: "dark", label: "Dark" }, { v: "tint", label: "Soft" }]} />
        </>
      );
      break;
    }
    case "telegram":
      body = (
        <>
          <Field label="Title" hint="Empty shows “Get new arrivals first”."><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"telegram">>({ title: e.target.value })} /></Field>
          {!ctx.hasChannel ? <Note>Shows once a public Telegram channel is connected.</Note> : null}
        </>
      );
      break;
    case "trust": {
      const ALL: { v: SectionOf<"trust">["items"][number]; label: string }[] = [
        { v: "cod", label: "Pay on delivery" }, { v: "telebirr", label: "Telebirr accepted" }, { v: "delivery", label: "Fast delivery" },
        { v: "pickup", label: "Pickup available" }, { v: "original", label: "100% original" }, { v: "returns", label: "Easy returns" },
      ];
      body = (
        <fieldset className="space-y-2">
          <legend className="field-label">Promises to show</legend>
          {ALL.map((o) => {
            const on = s.items.includes(o.v);
            return (
              <label key={o.v} className={cn("flex min-h-12 cursor-pointer items-center justify-between rounded-[14px] px-3.5 font-display text-[14px] font-semibold", on ? "bg-sunken" : "")}>
                {o.label}
                <Switch checked={on} onCheckedChange={(v) => set<SectionOf<"trust">>({ items: v ? ALL.map((x) => x.v).filter((x) => s.items.includes(x) || x === o.v) : s.items.filter((x) => x !== o.v) })} />
              </label>
            );
          })}
          <Note>Delivery and pickup also show the note and address from your settings.</Note>
        </fieldset>
      );
      break;
    }
    case "faq":
      body = (
        <>
          <Field label="Title"><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"faq">>({ title: e.target.value })} /></Field>
          {s.items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-[18px] bg-sunken p-3">
              <div className="flex items-center justify-between"><span className="font-display text-[13px] font-bold text-mist">Question {i + 1}</span><IconBtn label="Remove question" onClick={() => set<SectionOf<"faq">>({ items: s.items.filter((_, j) => j !== i) })}><X size={15} /></IconBtn></div>
              <Input aria-label={`Question ${i + 1}`} value={it.q} maxLength={160} className="bg-surface" onChange={(e) => set<SectionOf<"faq">>({ items: s.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
              <Textarea aria-label={`Answer ${i + 1}`} rows={2} value={it.a} maxLength={800} className="bg-surface" placeholder="Answer" onChange={(e) => set<SectionOf<"faq">>({ items: s.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            </div>
          ))}
          {s.items.length < 12 ? <Button type="button" variant="secondary" size="sm" onClick={() => set<SectionOf<"faq">>({ items: [...s.items, { q: "New question", a: "" }] })}><Plus size={15} /> Add question</Button> : null}
          <Note>Questions without an answer stay hidden.</Note>
        </>
      );
      break;
    case "story":
      body = (
        <>
          <ImagePicker value={s.imageKey} onChange={(k) => set<SectionOf<"story">>({ imageKey: k })} ctx={ctx} shape="square" label="Photo" />
          <Field label="Title"><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"story">>({ title: e.target.value })} placeholder="About us" /></Field>
          <Field label="Your story" hint="Empty uses your shop description."><Textarea rows={6} value={s.text} maxLength={1200} onChange={(e) => set<SectionOf<"story">>({ text: e.target.value })} /></Field>
        </>
      );
      break;
    case "contact":
      body = (
        <>
          <Field label="Title"><Input value={s.title} maxLength={60} onChange={(e) => set<SectionOf<"contact">>({ title: e.target.value })} placeholder="Visit or contact us" /></Field>
          <Field label="Opening hours"><Input value={s.hours} maxLength={120} onChange={(e) => set<SectionOf<"contact">>({ hours: e.target.value })} placeholder="Mon–Sat, 9:00–19:00" /></Field>
          <Note>Phone, Telegram and address come from Settings › Contact.</Note>
        </>
      );
      break;
  }
  return (
    <div className={cn("space-y-4", !bare && "p-5")}>
      {!bare ? <h2 className="font-display text-xl font-extrabold tracking-[-0.02em]">{SECTION_INFO[s.type].label}</h2> : null}
      {body}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="button" variant="outline" size="sm" onClick={() => set({ hidden: !s.hidden })}>{s.hidden ? <><Eye size={15} /> Show</> : <><EyeOff size={15} /> Hide</>}</Button>
        <Button type="button" variant="danger" size="sm" onClick={onRemove}><Trash2 size={15} /> Remove section</Button>
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] bg-sunken px-3.5 py-2.5 text-[13px] font-semibold text-mist">{children}</p>;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── theme ────────────────────────────────────────────────────────────────────

function ThemeForm({ theme, onChange, logoUrl, handle }: { theme: StoreTheme; onChange: (t: StoreTheme) => void; logoUrl: string | null; handle: string }) {
  const set = (patch: Partial<StoreTheme>) => onChange({ ...theme, ...patch });
  // Typed value while it's incomplete; follows the theme once a full color is set.
  const [typed, setTyped] = useState({ for: theme.accent, v: theme.accent.slice(1) });
  const hex = typed.for === theme.accent ? typed.v : theme.accent.slice(1);
  const fg = readableOn(theme.accent);
  const ratio = contrastRatio(theme.accent, fg);
  const bg = theme.background === "dark" ? "#0e0f13" : "#ffffff";
  const asText = contrastRatio(theme.accent, bg);
  const logoRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [logo, setLogo] = useState(logoUrl);

  return (
    <div className="space-y-6">
      <section>
        <p className="field-label">Start from a theme</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((k) => {
            const pr = PRESET_THEMES[k];
            const on = theme.preset === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onChange({ ...pr })} className={cn("overflow-hidden rounded-[18px] border-2 text-left transition-colors", on ? "border-ink" : "border-line hover:border-line-strong")}>
                <span className="flex h-16 items-end gap-1.5 p-2.5" style={{ background: pr.background === "dark" ? "#0e0f13" : pr.background === "paper" ? "#f8f4f1" : "#ffffff" }}>
                  <span className="h-6 w-6" style={{ background: pr.accent, borderRadius: pr.corners === "sharp" ? 0 : pr.corners === "soft" ? 6 : 999 }} />
                  <span className="h-2 flex-1 rounded-full" style={{ background: pr.background === "dark" ? "#3a3e4a" : "#e5e1dc" }} />
                </span>
                <span className="block px-2.5 py-2">
                  <span className="flex items-center gap-1.5 font-display text-[14px] font-bold">{pr.label}{on ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span className="block truncate text-[11px] font-semibold text-mist">{pr.fits}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="field-label">Logo</p>
        <div className="flex items-center gap-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} className="text-faint" />}
          </span>
          <div className="space-y-1">
            <Button type="button" size="sm" variant="ink" onClick={() => logoRef.current?.click()}>{logo ? "Replace logo" : "Upload logo"}</Button>
            <p className="text-[12px] font-semibold text-mist">Square works best. Also shows in link previews.</p>
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const key = await uploadImage(`/api/shops/${handle}/uploads`, f);
                await api(`/api/shops/${handle}/logo`, { body: { key, kind: "logo" } });
                setLogo(URL.createObjectURL(f));
                toast("Logo updated. It's live right away.", "success");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Upload failed", "error");
              }
            }}
          />
        </div>
      </section>

      <section>
        <p className="field-label">Brand color</p>
        <div role="radiogroup" aria-label="Brand color" className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={theme.accent === c} aria-label={c} onClick={() => set({ accent: c })} className={cn("grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow", theme.accent === c ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line-strong")} style={{ background: c }}>
              {theme.accent === c ? <Check size={16} strokeWidth={3} style={{ color: readableOn(c) }} /> : null}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="flex h-11 flex-1 items-center gap-1 rounded-full bg-sunken px-4 font-display text-sm font-bold text-mist">
            #
            <input
              aria-label="Custom color"
              value={hex}
              maxLength={6}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                const next = v.length === 6 ? `#${v.toLowerCase()}` : theme.accent;
                setTyped({ for: next, v });
                if (next !== theme.accent) set({ accent: next });
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-[14px] font-semibold text-ink outline-none"
            />
          </label>
          <span className="h-11 w-11 shrink-0 rounded-full" style={{ background: theme.accent }} aria-hidden />
        </div>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full px-3 py-1 font-display text-[12px] font-bold" style={{ background: theme.accent, color: fg }}>Button text {fg === "#ffffff" ? "white" : "black"} · {ratio.toFixed(1)}:1</span>
          {asText < 3 ? <span className="rounded-full bg-adey-soft px-3 py-1 font-display text-[12px] font-bold text-adey-ink">Light color: links use a darker shade</span> : null}
        </p>
      </section>

      <Segmented label="Background" value={theme.background} onChange={(v) => set({ background: v })} options={[{ v: "white", label: "White" }, { v: "paper", label: "Warm" }, { v: "dark", label: "Dark" }]} />

      <section>
        <p className="field-label">Fonts</p>
        <div role="radiogroup" aria-label="Fonts" className="grid grid-cols-2 gap-2">
          {([
            { v: "bold", label: "Bold", cls: "font-display font-extrabold" },
            { v: "clean", label: "Clean", cls: "store-font-clean font-semibold" },
            { v: "elegant", label: "Elegant", cls: "store-font-elegant" },
            { v: "amharic", label: "Amharic first", cls: "store-font-amharic font-bold" },
          ] as const).map((f) => (
            <button key={f.v} type="button" role="radio" aria-checked={theme.font === f.v} onClick={() => set({ font: f.v })} className={cn("flex h-16 items-center gap-2.5 rounded-[16px] border-2 px-3 text-left", theme.font === f.v ? "border-ink" : "border-line hover:border-line-strong", f.cls)}>
              {f.v === "elegant" ? <h3 className="text-2xl">Aa</h3> : <span className="text-2xl">{f.v === "amharic" ? "ሀለ" : "Aa"}</span>}
              <span className="font-display text-[13px] font-bold">{f.label}</span>
            </button>
          ))}
        </div>
      </section>

      <Segmented label="Corners" value={theme.corners} onChange={(v) => set({ corners: v })} options={[{ v: "sharp", label: "Sharp" }, { v: "soft", label: "Soft" }, { v: "round", label: "Round" }]} />
      <Segmented label="Buttons" value={theme.buttons} onChange={(v) => set({ buttons: v })} options={[{ v: "pill", label: "Pill" }, { v: "press", label: "Press" }, { v: "square", label: "Square" }]} />
      <Segmented label="Product photos" value={theme.photo} onChange={(v) => set({ photo: v })} options={[{ v: "square", label: "Square" }, { v: "portrait", label: "Portrait" }, { v: "wide", label: "Wide" }]} />
    </div>
  );
}

// ── menu & announcement ─────────────────────────────────────────────────────

function MenuForm({ design, ctx, update }: { design: StoreDesign; ctx: FormCtx; update: (fn: (d: StoreDesign) => StoreDesign) => void }) {
  const ann = design.announcement;
  const setAnn = (patch: Partial<StoreDesign["announcement"]>) => update((d) => ({ ...d, announcement: { ...d.announcement, ...patch } }));
  const setItem = (i: number, patch: Partial<StoreDesign["menu"][number]>) => update((d) => ({ ...d, menu: d.menu.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const moveItem = (i: number, by: -1 | 1) =>
    update((d) => {
      const xs = [...d.menu];
      const j = i + by;
      if (j < 0 || j >= xs.length) return d;
      [xs[i], xs[j]] = [xs[j], xs[i]];
      return { ...d, menu: xs };
    });
  const firstCat = ctx.categories[0];
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-display text-[15px] font-bold">Announcement bar</span>
            <span className="block text-[13px] font-semibold text-mist">A thin line above your header.</span>
          </span>
          <Switch checked={ann.enabled} onCheckedChange={(v) => setAnn({ enabled: v })} />
        </label>
        {ann.enabled ? (
          <>
            <Input aria-label="Announcement text" value={ann.text} maxLength={120} onChange={(e) => setAnn({ text: e.target.value })} placeholder="Free delivery in Addis over ETB 5,000" />
            <label className="flex items-center justify-between gap-3 font-display text-[14px] font-semibold">
              Make it a link
              <Switch checked={Boolean(ann.link)} onCheckedChange={(v) => setAnn({ link: v ? { kind: "all", value: "" } : null })} />
            </label>
            {ann.link ? <LinkPicker value={ann.link} onChange={(l) => setAnn({ link: l })} ctx={ctx} label="Goes to" /> : null}
          </>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-line pt-5">
        <div>
          <p className="font-display text-[15px] font-bold">Menu</p>
          <p className="text-[13px] font-semibold text-mist">Up to 6 links in your header and footer.</p>
        </div>
        {design.menu.map((m, i) => (
          <div key={i} className="space-y-2 rounded-[18px] bg-sunken p-3">
            <div className="flex items-center gap-1">
              <Input aria-label={`Menu link ${i + 1} label`} value={m.label} maxLength={32} className="bg-surface" onChange={(e) => setItem(i, { label: e.target.value })} />
              <IconBtn label="Move up" onClick={() => moveItem(i, -1)} disabled={i === 0}><ArrowUp size={15} /></IconBtn>
              <IconBtn label="Move down" onClick={() => moveItem(i, 1)} disabled={i === design.menu.length - 1}><ArrowDown size={15} /></IconBtn>
              <IconBtn label="Remove link" onClick={() => update((d) => ({ ...d, menu: d.menu.filter((_, j) => j !== i) }))}><X size={15} /></IconBtn>
            </div>
            <LinkPicker value={m.link} onChange={(l) => setItem(i, { link: l })} ctx={ctx} label="Goes to" />
          </div>
        ))}
        {design.menu.length < 6 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => update((d) => ({ ...d, menu: [...d.menu, firstCat ? { label: firstCat.split(" > ").at(-1)!.slice(0, 32), link: { kind: "category", value: firstCat } } : { label: "All products", link: { kind: "all", value: "" } }] }))}
          >
            <Plus size={15} /> Add link
          </Button>
        ) : null}
      </section>
    </div>
  );
}

