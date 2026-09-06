import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import type { TelegramIdentity } from "@/lib/auth/telegram";

export async function upsertTelegramUser(
  identity: TelegramIdentity,
): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramId, identity.telegramId),
  });

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        firstName: identity.firstName,
        lastName: identity.lastName ?? null,
        username: identity.username ?? null,
        languageCode: identity.languageCode ?? null,
        isPremium: identity.isPremium,
        photoUrl: identity.photoUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramId: identity.telegramId,
      firstName: identity.firstName,
      lastName: identity.lastName ?? null,
      username: identity.username ?? null,
      languageCode: identity.languageCode ?? null,
      isPremium: identity.isPremium,
      photoUrl: identity.photoUrl ?? null,
    })
    .returning();

  return created;
}

export async function getUserById(id: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  return user ?? null;
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    languageCode: user.languageCode,
    isPremium: user.isPremium,
    photoUrl: user.photoUrl,
    createdAt: user.createdAt.toISOString(),
  };
}
