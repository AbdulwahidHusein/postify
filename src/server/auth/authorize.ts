import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { shopMembers, shops, type MemberRole, type Shop } from "@/server/db/schema";
import { forbidden, notFound } from "@/server/http";
import { requireSession, type SessionPayload } from "@/server/auth/session";

export type Action =
  | "shop.view"
  | "shop.settings"
  | "shop.staff"
  | "products.manage"
  | "orders.manage"
  | "customers.view"
  | "inbox.manage"
  | "analytics.view"
  | "channels.manage";

const ROLE_ACTIONS: Record<MemberRole, ReadonlySet<Action>> = {
  owner: new Set<Action>([
    "shop.view",
    "shop.settings",
    "shop.staff",
    "products.manage",
    "orders.manage",
    "customers.view",
    "inbox.manage",
    "analytics.view",
    "channels.manage",
  ]),
  admin: new Set<Action>([
    "shop.view",
    "shop.settings",
    "products.manage",
    "orders.manage",
    "customers.view",
    "inbox.manage",
    "analytics.view",
    "channels.manage",
  ]),
  staff: new Set<Action>([
    "shop.view",
    "products.manage",
    "orders.manage",
    "customers.view",
    "inbox.manage",
  ]),
};

export function can(role: MemberRole, action: Action): boolean {
  return ROLE_ACTIONS[role].has(action);
}

export function allowedActions(role: MemberRole): Action[] {
  return [...ROLE_ACTIONS[role]];
}

export type ShopAccess = {
  session: SessionPayload;
  shop: Shop;
  role: MemberRole;
};

/**
 * The one permission gate. Resolves the shop by handle, checks membership and
 * the role's right to perform `action`. Non-members get 404, not 403, so shop
 * existence is not leaked through the admin API.
 */
export async function authorize(shopHandle: string, action: Action): Promise<ShopAccess> {
  const session = await requireSession();
  return authorizeUser(session, shopHandle, action);
}

export async function authorizeUser(
  session: SessionPayload,
  shopHandle: string,
  action: Action,
): Promise<ShopAccess> {
  const row = await db
    .select({ shop: shops, role: shopMembers.role })
    .from(shops)
    .innerJoin(shopMembers, eq(shopMembers.shopId, shops.id))
    .where(and(eq(shops.handle, shopHandle), eq(shopMembers.userId, session.userId)))
    .limit(1);
  const hit = row[0];
  if (!hit) throw notFound("Shop not found");
  if (!can(hit.role, action)) throw forbidden();
  return { session, shop: hit.shop, role: hit.role };
}
