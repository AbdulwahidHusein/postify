import "server-only";

import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { shopInvites, shopMembers, users, type MemberRole } from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { shortCode } from "@/server/ids";
import { botStartLink } from "@/server/services/telegram";

const INVITE_TTL_MS = 7 * 86_400_000;

export async function listMembers(shopId: string) {
  const rows = await db
    .select({ member: shopMembers, user: users })
    .from(shopMembers)
    .innerJoin(users, eq(users.id, shopMembers.userId))
    .where(eq(shopMembers.shopId, shopId))
    .orderBy(asc(shopMembers.createdAt));
  return rows.map(({ member, user }) => ({
    id: member.id,
    userId: user.id,
    role: member.role,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    username: user.username,
    since: member.createdAt.toISOString(),
  }));
}

export async function createInvite(shopId: string, role: Exclude<MemberRole, "owner">, byUserId: string) {
  const code = shortCode(16);
  await db.insert(shopInvites).values({
    code,
    shopId,
    role,
    createdByUserId: byUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return { code, link: botStartLink(`join_${code}`), expiresInDays: 7 };
}

/** Called by the bot on /start join_<code>. Single use, atomic. */
export async function acceptInvite(code: string, userId: string) {
  const [invite] = await db
    .update(shopInvites)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(shopInvites.code, code), isNull(shopInvites.usedAt), gt(shopInvites.expiresAt, new Date())))
    .returning();
  if (!invite) throw new AppError("This invite link has expired or was already used", 410, "invite_invalid");
  await db
    .insert(shopMembers)
    .values({ shopId: invite.shopId, userId, role: invite.role })
    .onConflictDoNothing();
  return invite;
}

export async function removeMember(shopId: string, memberId: string, actingUserId: string) {
  const member = await db.query.shopMembers.findFirst({
    where: and(eq(shopMembers.id, memberId), eq(shopMembers.shopId, shopId)),
  });
  if (!member) throw notFound("Member not found");
  if (member.role === "owner") throw new AppError("The owner can't be removed");
  if (member.userId === actingUserId) throw new AppError("You can't remove yourself");
  await db.delete(shopMembers).where(eq(shopMembers.id, memberId));
}
