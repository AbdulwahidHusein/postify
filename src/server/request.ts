import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, type User } from "@/server/db/schema";
import { getSession, requireSession } from "@/server/auth/session";
import { shortCode } from "@/server/ids";
import { isProduction, serverEnv } from "@/server/env";

export async function getViewer(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, session.userId) })) ?? null;
}

export async function requireViewer(): Promise<User> {
  const session = await requireSession();
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) {
    const { AuthError } = await import("@/server/auth/session");
    throw new AuthError("Your session expired, please sign in again", 401);
  }
  return user;
}

const CART_COOKIE = "goods_cart";

/**
 * Cart owner: the signed-in user, otherwise an anonymous cookie token.
 * `create` sets the cookie when missing (only allowed in route handlers).
 */
export async function cartOwnerKey(create: boolean): Promise<string | null> {
  const session = await getSession();
  if (session) return `user:${session.userId}`;
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9]{24}$/.test(existing)) return `anon:${existing}`;
  if (!create) return null;
  const token = shortCode(24);
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(serverEnv.COOKIE_DOMAIN ? { domain: serverEnv.COOKIE_DOMAIN } : {}),
  });
  return `anon:${token}`;
}
