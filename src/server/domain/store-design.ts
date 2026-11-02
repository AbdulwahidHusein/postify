import "server-only";

import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/server/db";
import { shops, type Shop } from "@/server/db/schema";
import { serverEnv } from "@/server/env";
import { AppError } from "@/server/http";
import { designSchema, readDesign, type StoreDesign } from "@/lib/store-design";

type Stored = { design?: unknown; designDraft?: unknown; designPublishedAt?: string | null };

function stored(shop: Shop): Stored {
  return shop.settings as unknown as Stored;
}

/** What buyers see. */
export function publishedDesign(shop: Shop): StoreDesign {
  return readDesign(stored(shop).design, shop.settings.theme, shop.name);
}

/** What the seller is editing: the draft if there is one, else the published design. */
export function draftDesign(shop: Shop): { design: StoreDesign; hasDraft: boolean } {
  const s = stored(shop);
  if (s.designDraft) {
    const parsed = designSchema.safeParse(s.designDraft);
    if (parsed.success) return { design: parsed.data, hasDraft: true };
  }
  return { design: publishedDesign(shop), hasDraft: false };
}

function checkKeys(shop: Shop, design: StoreDesign) {
  for (const s of design.sections) {
    const key = "imageKey" in s ? s.imageKey : null;
    if (key && !key.startsWith(`shops/${shop.id}/`)) throw new AppError("Invalid image");
  }
}

async function writeSettings(shop: Shop, patch: Partial<Stored>) {
  const [updated] = await db
    .update(shops)
    .set({ settings: { ...shop.settings, ...patch } as Shop["settings"], updatedAt: new Date() })
    .where(eq(shops.id, shop.id))
    .returning();
  return updated;
}

export async function saveDraft(shop: Shop, input: unknown) {
  const design = designSchema.parse(input);
  checkKeys(shop, design);
  await writeSettings(shop, { designDraft: design });
  return design;
}

export async function publishDraft(shop: Shop) {
  const { design } = draftDesign(shop);
  checkKeys(shop, design);
  // Keep the legacy accent in step: Telegram previews and older code read it.
  const settings = { ...shop.settings, theme: { ...shop.settings.theme, accent: design.theme.accent } };
  const [updated] = await db
    .update(shops)
    .set({ settings: { ...settings, design, designDraft: null, designPublishedAt: new Date().toISOString() } as unknown as Shop["settings"], updatedAt: new Date() })
    .where(eq(shops.id, shop.id))
    .returning();
  return updated;
}

export async function discardDraft(shop: Shop) {
  return writeSettings(shop, { designDraft: null });
}

// ── preview tokens ───────────────────────────────────────────────────────────
// The customizer loads the storefront in an iframe with a short-lived signed
// token, so the draft renders on any host (subdomain or /s/<shop>) without
// relying on the dashboard's session cookie.
const key = () => new TextEncoder().encode(`${serverEnv.SESSION_SECRET}:store-preview`);

export async function previewToken(shopId: string) {
  return new SignJWT({ shop: shopId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
}

export async function previewAllowed(shopId: string, token: string | undefined | null) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.shop === shopId;
  } catch {
    return false;
  }
}
