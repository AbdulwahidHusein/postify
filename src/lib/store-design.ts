/**
 * Storefront design: theme, announcement bar, menu and an ordered list of
 * page sections. Shared by the storefront renderer (server) and the
 * customizer (client), so it must stay free of server-only imports.
 *
 * Stored in shop.settings.design (published) and shop.settings.designDraft
 * (what the seller is editing). Shops created before the customizer have
 * neither; `designFromLegacy` builds one from their old theme settings.
 */
import { z } from "zod";

// ── links ────────────────────────────────────────────────────────────────────
export const linkSchema = z.object({
  kind: z.enum(["all", "category", "collection", "product", "telegram", "url"]),
  value: z.string().trim().max(300).default(""),
});
export type StoreLink = z.infer<typeof linkSchema>;

// ── theme ────────────────────────────────────────────────────────────────────
export const PRESETS = ["bold", "clean", "boutique", "night"] as const;
export type Preset = (typeof PRESETS)[number];

export const themeSchema = z.object({
  preset: z.enum(PRESETS),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.enum(["paper", "white", "dark"]),
  font: z.enum(["bold", "clean", "elegant", "amharic"]),
  corners: z.enum(["sharp", "soft", "round"]),
  buttons: z.enum(["pill", "press", "square"]),
  photo: z.enum(["square", "portrait", "wide"]),
  quickAdd: z.boolean(),
});
export type StoreTheme = z.infer<typeof themeSchema>;

export const PRESET_THEMES: Record<Preset, StoreTheme & { label: string; fits: string }> = {
  bold: { label: "Bold", fits: "Electronics, gadgets", preset: "bold", accent: "#2f5bff", background: "white", font: "bold", corners: "round", buttons: "pill", photo: "square", quickAdd: true },
  clean: { label: "Clean", fits: "Home, everyday goods", preset: "clean", accent: "#0f766e", background: "paper", font: "clean", corners: "soft", buttons: "square", photo: "square", quickAdd: false },
  boutique: { label: "Boutique", fits: "Fashion, beauty", preset: "boutique", accent: "#1c1917", background: "white", font: "elegant", corners: "sharp", buttons: "square", photo: "portrait", quickAdd: false },
  night: { label: "Night", fits: "Sneakers, streetwear, drops", preset: "night", accent: "#c8f03c", background: "dark", font: "bold", corners: "round", buttons: "pill", photo: "square", quickAdd: true },
};

// ── sections ─────────────────────────────────────────────────────────────────
const text = (max: number) => z.string().trim().max(max).default("");
const imageKey = z.string().max(300).nullable().default(null);

const sectionBase = { id: z.string().regex(/^[a-z0-9]{6,16}$/), hidden: z.boolean().default(false) };

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({
    ...sectionBase,
    type: z.literal("hero"),
    layout: z.enum(["split", "image", "text"]).default("split"),
    heading: text(90),
    text: text(240),
    buttonLabel: text(32),
    link: linkSchema.default({ kind: "all", value: "" }),
    imageKey,
    background: z.enum(["tint", "accent", "dark", "plain"]).default("tint"),
    height: z.enum(["s", "m", "l"]).default("m"),
  }),
  z.object({ ...sectionBase, type: z.literal("categories"), title: text(60), style: z.enum(["circles", "tiles"]).default("circles") }),
  z.object({ ...sectionBase, type: z.literal("featured"), title: text(60), collectionId: z.string().uuid().nullable().default(null), limit: z.number().int().min(4).max(16).default(8) }),
  z.object({ ...sectionBase, type: z.literal("grid"), title: text(60) }),
  z.object({
    ...sectionBase,
    type: z.literal("promo"),
    heading: text(90),
    text: text(200),
    buttonLabel: text(32),
    link: linkSchema.default({ kind: "all", value: "" }),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    background: z.enum(["accent", "dark", "tint"]).default("accent"),
  }),
  z.object({ ...sectionBase, type: z.literal("telegram"), title: text(60) }),
  z.object({
    ...sectionBase,
    type: z.literal("trust"),
    items: z.array(z.enum(["cod", "telebirr", "delivery", "pickup", "original", "returns"])).max(6).default(["cod", "delivery", "original"]),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("faq"),
    title: text(60),
    items: z.array(z.object({ q: z.string().trim().min(1).max(160), a: z.string().trim().max(800) })).max(12).default([]),
  }),
  z.object({ ...sectionBase, type: z.literal("story"), title: text(60), text: text(1200), imageKey }),
  z.object({ ...sectionBase, type: z.literal("contact"), title: text(60), hours: text(120) }),
]);
export type StoreSection = z.infer<typeof sectionSchema>;
export type SectionType = StoreSection["type"];
export type SectionOf<T extends SectionType> = Extract<StoreSection, { type: T }>;

export const SECTION_INFO: Record<SectionType, { label: string; blurb: string; group: "sell" | "trust" | "brand" | "telegram"; multiple: boolean }> = {
  hero: { label: "Hero banner", blurb: "Big headline, photo and one button.", group: "sell", multiple: true },
  categories: { label: "Category tiles", blurb: "Help buyers jump to what they want.", group: "sell", multiple: false },
  featured: { label: "Featured products", blurb: "A swipeable row like “New arrivals”.", group: "sell", multiple: true },
  grid: { label: "All products", blurb: "Every product with search and categories.", group: "sell", multiple: false },
  promo: { label: "Promo with countdown", blurb: "A deal that hides itself when it ends.", group: "sell", multiple: true },
  telegram: { label: "Telegram channel", blurb: "Invite buyers to join your channel.", group: "telegram", multiple: false },
  trust: { label: "Trust strip", blurb: "Payment, delivery and original-goods promises.", group: "trust", multiple: false },
  faq: { label: "FAQ", blurb: "Answer “original? warranty? delivery?” once.", group: "trust", multiple: false },
  story: { label: "Our story", blurb: "A photo and a few lines about you.", group: "brand", multiple: false },
  contact: { label: "Visit & contact", blurb: "Address, hours, call and Telegram.", group: "trust", multiple: false },
};

// ── whole design ─────────────────────────────────────────────────────────────
export const designSchema = z.object({
  v: z.literal(1),
  theme: themeSchema,
  announcement: z.object({ enabled: z.boolean(), text: text(120), link: linkSchema.nullable().default(null) }),
  menu: z.array(z.object({ label: z.string().trim().min(1).max(32), link: linkSchema })).max(6),
  sections: z.array(sectionSchema).max(24),
});
export type StoreDesign = z.infer<typeof designSchema>;

export function newSectionId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

/** A new section of a type, with sensible starting copy. */
export function blankSection(type: SectionType): StoreSection {
  const base = { id: newSectionId(), hidden: false };
  switch (type) {
    case "hero":
      return { ...base, type, layout: "split", heading: "New in stock", text: "", buttonLabel: "Shop now", link: { kind: "all", value: "" }, imageKey: null, background: "tint", height: "m" };
    case "categories":
      return { ...base, type, title: "", style: "circles" };
    case "featured":
      return { ...base, type, title: "New arrivals", collectionId: null, limit: 8 };
    case "grid":
      return { ...base, type, title: "" };
    case "promo": {
      const end = new Date(Date.now() + 3 * 864e5);
      end.setHours(23, 59, 0, 0);
      return { ...base, type, heading: "Weekend deal", text: "", buttonLabel: "Shop the deal", link: { kind: "all", value: "" }, endsAt: end.toISOString(), background: "accent" };
    }
    case "telegram":
      return { ...base, type, title: "" };
    case "trust":
      return { ...base, type, items: ["cod", "delivery", "original"] };
    case "faq":
      return { ...base, type, title: "Questions", items: [{ q: "Are your products original?", a: "" }, { q: "How long does delivery take?", a: "" }] };
    case "story":
      return { ...base, type, title: "Our story", text: "", imageKey: null };
    case "contact":
      return { ...base, type, title: "", hours: "" };
  }
}

type LegacyTheme = {
  accent?: string;
  tagline?: string | null;
  bannerKey?: string | null;
  sections?: string[];
  featuredCollectionId?: string | null;
  font?: string;
};

/** Build a design for a shop that only has the old theme settings. */
export function designFromLegacy(legacy: LegacyTheme | undefined, shopName: string): StoreDesign {
  const l = legacy ?? {};
  const on = new Set(l.sections ?? ["hero", "grid", "about", "contact"]);
  const accent = /^#[0-9a-fA-F]{6}$/.test(l.accent ?? "") ? l.accent! : "#ff5a36";
  const sections: StoreSection[] = [];
  if (on.has("hero")) {
    sections.push({
      ...(blankSection("hero") as SectionOf<"hero">),
      layout: l.bannerKey ? "image" : "text",
      heading: shopName,
      text: l.tagline ?? "",
      buttonLabel: "",
      imageKey: l.bannerKey ?? null,
      background: "accent",
      height: l.bannerKey ? "m" : "s",
    });
  }
  if (on.has("featured") && l.featuredCollectionId) {
    sections.push({ ...(blankSection("featured") as SectionOf<"featured">), title: "", collectionId: l.featuredCollectionId });
  }
  sections.push({ ...(blankSection("grid") as SectionOf<"grid">), hidden: !on.has("grid") });
  if (on.has("about")) sections.push({ ...(blankSection("story") as SectionOf<"story">), title: "", text: "" });
  if (on.has("contact")) sections.push(blankSection("contact"));
  return {
    v: 1,
    theme: { ...PRESET_THEMES.bold, accent, background: "paper", font: l.font === "serif" ? "elegant" : "bold" },
    announcement: { enabled: false, text: "", link: null },
    menu: [],
    sections,
  };
}

/** Parse stored JSON; fall back to the legacy conversion when missing or invalid. */
export function readDesign(raw: unknown, legacy: LegacyTheme | undefined, shopName: string): StoreDesign {
  if (raw) {
    const parsed = designSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return designFromLegacy(legacy, shopName);
}

// ── theme → CSS ──────────────────────────────────────────────────────────────
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Ink or white, whichever reads better on the color. */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  const L = luminance(hex);
  return (L + 0.05) / 0.0556 > 1.05 / (L + 0.05) ? "#111111" : "#ffffff";
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const RADIUS = { sharp: ["0px", "0px", "2px"], soft: ["8px", "12px", "8px"], round: ["18px", "24px", "999px"] } as const;

/** CSS custom properties for a storefront theme. Applied on the store wrapper. */
export function themeVars(theme: StoreTheme): Record<string, string> {
  const fg = readableOn(theme.accent);
  const dark = theme.background === "dark";
  const [card, panel, control] = RADIUS[theme.corners];
  const vars: Record<string, string> = {
    "--accent": theme.accent,
    "--accent-hover": `color-mix(in oklab, ${theme.accent} 86%, ${dark ? "white" : "black"})`,
    "--accent-soft": `color-mix(in oklab, ${theme.accent} 12%, ${dark ? "#0e0f13" : "white"})`,
    "--accent-fg": fg,
    "--accent-ink": dark ? theme.accent : fg === "#ffffff" ? theme.accent : `color-mix(in oklab, ${theme.accent} 62%, black)`,
    "--store-card": card,
    "--store-panel": panel,
    "--store-btn": theme.buttons === "pill" || theme.buttons === "press" ? "999px" : theme.corners === "sharp" ? "0px" : control === "999px" ? "14px" : control,
    "--store-btn-shadow": theme.buttons === "press" ? `0 3px 0 ${dark ? "#000" : "var(--ink)"}` : "none",
    "--store-photo": theme.photo === "portrait" ? "4 / 5" : theme.photo === "wide" ? "4 / 3" : "1 / 1",
  };
  if (theme.background === "white") Object.assign(vars, { "--canvas": "#ffffff", "--sunken": "#f4f4f5", "--line": "#ececee", "--line-strong": "#d6d6da" });
  if (dark) {
    Object.assign(vars, {
      "--canvas": "#0e0f13",
      "--surface": "#1a1c23",
      "--sunken": "#232631",
      "--ink": "#f2f4f7",
      "--ink-soft": "#d3d7de",
      "--mist": "#a1a7b3",
      "--faint": "#8a909c",
      "--line": "#2a2d36",
      "--line-strong": "#3a3e4a",
    });
  }
  return vars;
}

/** Font stack class names; the variables come from the root layout. */
export const FONT_CLASS: Record<StoreTheme["font"], string> = {
  bold: "store-font-bold",
  clean: "store-font-clean",
  elegant: "store-font-elegant",
  amharic: "store-font-amharic",
};

/** Where a store link points. `base` is "" on a shop subdomain, "/s/<handle>" otherwise. */
export function storeHref(link: StoreLink | null | undefined, ctx: { base: string; channelUrl?: string | null }): string | null {
  if (!link) return null;
  const root = ctx.base || "/";
  switch (link.kind) {
    case "all":
      return root;
    case "category":
      return link.value ? `${ctx.base}/?category=${encodeURIComponent(link.value)}` : root;
    case "collection":
      return link.value ? `${ctx.base}/c/${encodeURIComponent(link.value)}` : root;
    case "product":
      return link.value ? `${ctx.base}/p/${encodeURIComponent(link.value)}` : root;
    case "telegram":
      return link.value ? (link.value.startsWith("http") ? link.value : `https://t.me/${link.value.replace(/^@/, "")}`) : ctx.channelUrl ?? null;
    case "url":
      return /^https?:\/\//.test(link.value) ? link.value : null;
  }
}

/** A promo with a deadline that has passed is hidden from buyers. */
export function promoActive(endsAt: string | null): boolean {
  return !endsAt || new Date(endsAt).getTime() > Date.now();
}
