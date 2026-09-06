import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens } from "@/db/schema";
import type { TelegramIdentity } from "@/lib/auth/telegram";
import { upsertTelegramUser } from "@/lib/auth/users";

const TTL_MS = 1000 * 60 * 10; // 10 minutes

export async function createLoginTokenForIdentity(identity: TelegramIdentity) {
  const user = await upsertTelegramUser(identity);
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);

  await db.insert(loginTokens).values({
    token,
    userId: user.id,
    expiresAt,
  });

  return { token, expiresAt, user };
}

export async function consumeLoginToken(token: string) {
  const row = await db.query.loginTokens.findFirst({
    where: and(
      eq(loginTokens.token, token),
      isNull(loginTokens.usedAt),
      gt(loginTokens.expiresAt, new Date()),
    ),
  });

  if (!row?.userId) return null;

  await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(eq(loginTokens.id, row.id));

  return row.userId;
}
