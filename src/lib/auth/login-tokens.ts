import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens } from "@/db/schema";
import type { TelegramIdentity } from "@/lib/auth/telegram";
import { upsertTelegramUser } from "@/lib/auth/users";

const TTL_MS = 1000 * 60 * 10; // 10 minutes

/** Only allow same-origin relative paths (open-redirect safe). */
export function sanitizeAuthRedirect(path: string | null | undefined): string {
  const fallback = "/dashboard?auth=ok";
  if (!path) return fallback;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://") || trimmed.includes("\\")) return fallback;
  return trimmed;
}

export async function createLoginTokenForIdentity(
  identity: TelegramIdentity,
  opts?: { redirectPath?: string | null },
) {
  const user = await upsertTelegramUser(identity);
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const redirectPath = opts?.redirectPath
    ? sanitizeAuthRedirect(opts.redirectPath)
    : null;

  await db.insert(loginTokens).values({
    token,
    userId: user.id,
    redirectPath,
    expiresAt,
  });

  return { token, expiresAt, user, redirectPath };
}

export async function consumeLoginToken(token: string) {
  // Atomic single-use: the conditional UPDATE (usedAt IS NULL) guarantees that
  // two concurrent requests with the same token can't both consume it — the
  // row lock from the first UPDATE makes the second's WHERE no longer match.
  const claimed = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(loginTokens.token, token),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  const row = claimed[0];
  if (!row?.userId) return null;

  return {
    userId: row.userId,
    redirectPath: sanitizeAuthRedirect(row.redirectPath),
  };
}

/**
 * Map Telegram /start payload → post-login path.
 * - auth → dashboard (sellers / default)
 * - auth_msg_<productUuid> → resume messaging that product
 * - auth_inbox → buyer inbox
 */
export function redirectPathFromStartPayload(payload: string): string {
  const p = payload.trim();
  if (p === "auth_inbox") return "/inbox";

  const msg = /^auth_msg_([0-9a-f-]{36})$/i.exec(p);
  if (msg) {
    return `/auth/continue?message=${msg[1]}`;
  }

  return "/dashboard?auth=ok";
}
