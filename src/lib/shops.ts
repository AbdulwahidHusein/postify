import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shops, users, type Shop, type ShopSettings } from "@/db/schema";
import { slugify, uniqueSlugHint } from "@/lib/slug";

export const defaultSettings: ShopSettings = {
  defaultCurrency: "ETB",
  autoPublishMinConfidence: 0.8,
  linkMode: "reply",
  telegramChannel: null,
  ownerUsername: null,
  ownerPhone: null,
  sellCategories: [],
  logoUrl: null,
  logoSource: null,
};

export function normalizeShopSettings(
  settings: ShopSettings | null | undefined,
): ShopSettings {
  return {
    ...defaultSettings,
    ...settings,
    telegramChannel: settings?.telegramChannel ?? null,
    ownerUsername: settings?.ownerUsername ?? null,
    ownerPhone: settings?.ownerPhone ?? null,
    sellCategories: Array.isArray(settings?.sellCategories)
      ? settings.sellCategories
      : [],
    logoUrl: settings?.logoUrl ?? null,
    logoSource: settings?.logoSource ?? null,
  };
}

/** Accepts @name, t.me/name, or https://t.me/name → @name or URL-ish display. */
export function normalizeTelegramChannel(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  let value = raw.trim();
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(www\.)?t\.me\//i, "");
  value = value.replace(/^@/, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_]{4,64}$/.test(value)) {
    // keep custom links loosely (invite hashes etc.)
    const cleaned = raw.trim();
    return cleaned.slice(0, 160) || null;
  }
  return `@${value}`;
}

export function telegramChannelUrl(channel: string | null | undefined) {
  if (!channel?.trim()) return null;
  const raw = channel.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const user = raw.replace(/^@/, "");
  if (/^[A-Za-z0-9_]{4,64}$/.test(user)) return `https://t.me/${user}`;
  return null;
}

export async function listShopsForOwner(ownerUserId: string): Promise<Shop[]> {
  return db.query.shops.findMany({
    where: eq(shops.ownerUserId, ownerUserId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.slug, slug),
  });
  return shop ?? null;
}

export async function getOwnedShop(
  shopId: string,
  ownerUserId: string,
): Promise<Shop | null> {
  const shop = await db.query.shops.findFirst({
    where: and(eq(shops.id, shopId), eq(shops.ownerUserId, ownerUserId)),
  });
  return shop ?? null;
}

export async function getOwnedShopBySlug(
  slug: string,
  ownerUserId: string,
): Promise<Shop | null> {
  const shop = await db.query.shops.findFirst({
    where: and(eq(shops.slug, slug), eq(shops.ownerUserId, ownerUserId)),
  });
  return shop ?? null;
}

export async function updateShop(
  shopId: string,
  input: {
    name?: string;
    description?: string | null;
    settings?: Partial<ShopSettings>;
  },
): Promise<Shop> {
  const existing = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });
  if (!existing) {
    throw new Error("Shop not found");
  }

  const nextSettings = input.settings
    ? normalizeShopSettings({
        ...normalizeShopSettings(existing.settings),
        ...input.settings,
      })
    : undefined;

  const [updated] = await db
    .update(shops)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(nextSettings ? { settings: nextSettings } : {}),
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shopId))
    .returning();

  return updated;
}

async function ensureUniqueSlug(base: string, ownerUserId: string) {
  let candidate = slugify(base);
  const taken = await getShopBySlug(candidate);
  if (!taken) return candidate;

  candidate = `${slugify(base).slice(0, 40)}-${uniqueSlugHint(ownerUserId + Date.now())}`;
  return candidate;
}

export async function createShop(input: {
  ownerUserId: string;
  name: string;
  description?: string;
  slug?: string;
  settings?: Partial<ShopSettings>;
}): Promise<Shop> {
  const slug = await ensureUniqueSlug(
    input.slug?.trim() || input.name,
    input.ownerUserId,
  );

  const [created] = await db
    .insert(shops)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      settings: normalizeShopSettings({
        ...defaultSettings,
        ...input.settings,
      }),
    })
    .returning();

  return created;
}

/** Create a default shop only when the user has none (idempotent). */
export async function ensureDefaultShop(ownerUserId: string): Promise<Shop> {
  const existing = await listShopsForOwner(ownerUserId);
  if (existing[0]) return existing[0];

  const user = await db.query.users.findFirst({
    where: eq(users.id, ownerUserId),
  });
  const name = user?.firstName?.trim()
    ? `${user.firstName.trim()}'s shop`
    : "My shop";

  return createShop({ ownerUserId, name });
}

export function serializeShop(shop: Shop) {
  const settings = normalizeShopSettings(shop.settings);
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    description: shop.description,
    settings,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
  };
}
