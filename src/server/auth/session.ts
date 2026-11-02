import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { serverEnv, isProduction } from "@/server/env";

export const SESSION_COOKIE = "goods_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type SessionPayload = {
  userId: string;
  telegramId: string;
};

function secretKey() {
  return new TextEncoder().encode(serverEnv.SESSION_SECRET);
}

export async function sealSession(payload: SessionPayload) {
  return new SignJWT({ userId: payload.userId, telegramId: payload.telegramId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function openSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.telegramId !== "string") {
      return null;
    }
    return { userId: payload.userId, telegramId: payload.telegramId };
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    ...(serverEnv.COOKIE_DOMAIN ? { domain: serverEnv.COOKIE_DOMAIN } : {}),
  };
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await sealSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return openSession(token);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("Sign in to continue", 401);
  return session;
}
