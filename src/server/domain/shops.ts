import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import {
  shopMembers,
  shops,
  type MemberRole,
  type Shop,
  type ShopSettings,
} from "@/server/db/schema";
import { AppError } from "@/server/http";
import { shortCode, slugify } from "@/server/ids";
import { publicUrl } from "@/server/services/storage";
import { appUrl, serverEnv } from "@/server/env";

export const RESERVED_HANDLES = new Set([
  "www", "app", "api", "admin", "dashboard", "img", "static", "assets", "cdn", "mail",
  "goods", "help", "support", "status", "blog", "docs", "internal", "auth", "go", "s", "p",
]);

export function defaultShopSettings(): ShopSettings {
  return {
    ingestMode: "auto_publish",
    autoPublishMinConfidence: 0.8,
    buttonsOnPosts: true,
    buttonLanguage: "en",
    notifyOrders: true,
    notifyMessages: true,
    autoArchiveDays: null,
    delivery: {
      deliveryEnabled: true,
      pickupEnabled: false,
      deliveryFeeMinor: "0",
      deliveryNote: null,
      pickupAddress: null,
    },
    contact: { phone: null, telegramUsername: null, address: null },
    theme: { accent: "#0e6b4e", font: "sans", tagline: null, bannerKey: null, sections: ["hero", "grid", "about", "contact"] },
    sellCategories: [],
  };
}

/** Fill in defaults for settings written by older code or partial updates. */
export function normalizeSettings(raw: Partial<ShopSettings> | null | undefined): ShopSettings {
  const d = defaultShopSettings();
  const s = raw ?? {};
  return {
    ...d,
    ...s,
    delivery: { ...d.delivery, ...(s.delivery ?? {}) },
    contact: { ...d.contact, ...(s.contact ?? {}) },
    theme: { ...d.theme, ...(s.theme ?? {}) },
    sellCategories: s.sellCategories ?? d.sellCategories,
  };
}

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Shop address must be at least 3 characters")
  .max(32, "Shop address must be at most 32 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and hyphens")
  .refine((h) => !RESERVED_HANDLES.has(h), "This shop address is reserved");

async function handleTaken(handle: string, tx: DbOrTx = db) {
  const row = await tx.query.shops.findFirst({ where: eq(shops.handle, handle), columns: { id: true } });
  return Boolean(row);
}

/** Derive a free, valid handle from a name ("Abel's Shoes" → "abels-shoes"). */
export async function availableHandle(name: string, tx: DbOrTx = db): Promise<string> {
  let base = slugify(name).slice(0, 24).replace(/-+$/g, "");
  if (base.length < 3 || RESERVED_HANDLES.has(base)) base = `shop-${base}`.replace(/-+$/g, "");
  if (base.length < 3) base = "shop";
  if (!(await handleTaken(base, tx))) return base;
  for (let i = 0; i < 8; i += 1) {
    const candidate = `${base}-${shortCode(4).toLowerCase()}`;
    if (!(await handleTaken(candidate, tx))) return candidate;
  }
  throw new AppError("Could not allocate a shop address, try another name", 409);
}

export async function createShop(input: {
  ownerUserId: string;
  name: string;
  handle?: string;
  description?: string | null;
  locale?: "en" | "am";
}): Promise<Shop> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new AppError("Shop name is too short");
  return db.transaction(async (tx) => {
    let handle: string;
    if (input.handle) {
      handle = handleSchema.parse(input.handle);
      if (await handleTaken(handle, tx)) throw new AppError("That shop address is taken", 409, "handle_taken");
    } else {
      handle = await availableHandle(name, tx);
    }
    const settings = defaultShopSettings();
    if (input.locale === "am") settings.buttonLanguage = "am";
    const [shop] = await tx
      .insert(shops)
      .values({
        handle,
        name,
        description: input.description ?? null,
        locale: input.locale ?? "en",
        settings,
      })
      .returning();
    await tx.insert(shopMembers).values({ shopId: shop.id, userId: input.ownerUserId, role: "owner" });
    return shop;
  });
}

export async function getShopByHandle(handle: string): Promise<Shop | null> {
  return (await db.query.shops.findFirst({ where: eq(shops.handle, handle) })) ?? null;
}

export async function getShopById(id: string, tx: DbOrTx = db): Promise<Shop | null> {
  return (await tx.query.shops.findFirst({ where: eq(shops.id, id) })) ?? null;
}

export async function listShopsForUser(userId: string) {
  return db
    .select({ shop: shops, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(eq(shopMembers.userId, userId))
    .orderBy(asc(shopMembers.createdAt));
}

export async function memberRole(shopId: string, userId: string): Promise<MemberRole | null> {
  const row = await db.query.shopMembers.findFirst({
    where: and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)),
  });
  return row?.role ?? null;
}

export async function shopOwnerUserIds(shopId: string, tx: DbOrTx = db): Promise<string[]> {
  const rows = await tx
    .select({ userId: shopMembers.userId, role: shopMembers.role })
    .from(shopMembers)
    .where(eq(shopMembers.shopId, shopId));
  return rows.filter((r) => r.role === "owner" || r.role === "admin").map((r) => r.userId);
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const settingsPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).nullable(),
    locale: z.enum(["en", "am"]),
    status: z.enum(["active", "hidden"]),
    ingestMode: z.enum(["auto_publish", "always_draft", "paused"]),
    autoPublishMinConfidence: z.number().min(0.5).max(1),
    buttonsOnPosts: z.boolean(),
    buttonLanguage: z.enum(["en", "am"]),
    notifyOrders: z.boolean(),
    notifyMessages: z.boolean(),
    autoArchiveDays: z.number().int().min(7).max(365).nullable(),
    delivery: z
      .object({
        deliveryEnabled: z.boolean(),
        pickupEnabled: z.boolean(),
        deliveryFeeMinor: z.string().regex(/^\d{1,12}$/),
        deliveryNote: z.string().trim().max(300).nullable(),
        pickupAddress: z.string().trim().max(300).nullable(),
      })
      .partial(),
    contact: z
      .object({
        phone: z.string().trim().max(30).nullable(),
        telegramUsername: z.string().trim().max(64).nullable(),
        address: z.string().trim().max(300).nullable(),
      })
      .partial(),
    theme: z
      .object({
        accent: hex,
        font: z.enum(["sans", "serif"]),
        tagline: z.string().trim().max(140).nullable(),
        sections: z.array(z.enum(["hero", "featured", "grid", "about", "contact"])).max(5),
        featuredCollectionId: z.string().uuid().nullable(),
      })
      .partial(),
    sellCategories: z.array(z.string().max(160)).max(40),
  })
  .partial();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export async function updateShopSettings(shop: Shop, patch: SettingsPatch): Promise<Shop> {
  const current = normalizeSettings(shop.settings);
  const next: ShopSettings = {
    ...current,
    ...(patch.ingestMode !== undefined && { ingestMode: patch.ingestMode }),
    ...(patch.autoPublishMinConfidence !== undefined && {
      autoPublishMinConfidence: patch.autoPublishMinConfidence,
    }),
    ...(patch.buttonsOnPosts !== undefined && { buttonsOnPosts: patch.buttonsOnPosts }),
    ...(patch.buttonLanguage !== undefined && { buttonLanguage: patch.buttonLanguage }),
    ...(patch.notifyOrders !== undefined && { notifyOrders: patch.notifyOrders }),
    ...(patch.notifyMessages !== undefined && { notifyMessages: patch.notifyMessages }),
    ...(patch.autoArchiveDays !== undefined && { autoArchiveDays: patch.autoArchiveDays }),
    ...(patch.sellCategories !== undefined && { sellCategories: patch.sellCategories }),
    delivery: { ...current.delivery, ...(patch.delivery ?? {}) },
    contact: { ...current.contact, ...(patch.contact ?? {}) },
    theme: { ...current.theme, ...(patch.theme ?? {}) },
  };
  if (!next.delivery.deliveryEnabled && !next.delivery.pickupEnabled) {
    throw new AppError("Enable delivery, pickup, or both");
  }
  const [updated] = await db
    .update(shops)
    .set({
      settings: next,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.locale !== undefined && { locale: patch.locale }),
      ...(patch.status !== undefined && { status: patch.status }),
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id))
    .returning();
  return updated;
}

export function shopLogoUrl(shop: Pick<Shop, "logoKey">): string | null {
  return shop.logoKey ? publicUrl(shop.logoKey) : null;
}

export function serializeShop(shop: Shop) {
  const settings = normalizeSettings(shop.settings);
  return {
    id: shop.id,
    handle: shop.handle,
    name: shop.name,
    description: shop.description,
    logoUrl: shopLogoUrl(shop),
    locale: shop.locale,
    currency: shop.currency,
    status: shop.status,
    settings,
    createdAt: shop.createdAt.toISOString(),
  };
}

export type SerializedShop = ReturnType<typeof serializeShop>;

/** Public storefront address: the shop subdomain in production, /s/<handle> locally. */
export function storefrontUrl(handle: string) {
  const root = serverEnv.ROOT_DOMAIN.toLowerCase();
  if (!serverEnv.SHOP_SUBDOMAINS || !root || root.startsWith("localhost") || root.startsWith("127.")) return `${appUrl()}/s/${handle}`;
  return `https://${handle}.${root}`;
}

/** Storefront address for display, without the scheme. */
export function storefrontHost(handle: string) {
  return storefrontUrl(handle).replace(/^https?:\/\//, "");
}
