import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { deliverChatNotification } from "@/lib/chat/telegram-bridge";

export async function enqueueChatNotify(input: {
  kind: "seller_new_message" | "buyer_new_message";
  messageId: string;
  conversationId: string;
}) {
  await db.insert(notificationOutbox).values({
    kind: input.kind,
    payload: {
      messageId: input.messageId,
      conversationId: input.conversationId,
    },
    status: "pending",
    nextAttemptAt: new Date(),
  });

  // Best-effort flush in-request for snappy UX; failures stay in outbox.
  void flushOutbox(8).catch((err) => {
    console.warn("[chat] outbox flush failed", err);
  });
}

export async function flushOutbox(limit = 20) {
  const now = new Date();
  const jobs = await db.query.notificationOutbox.findMany({
    where: and(
      eq(notificationOutbox.status, "pending"),
      lte(notificationOutbox.nextAttemptAt, now),
    ),
    orderBy: [asc(notificationOutbox.createdAt)],
    limit,
  });

  for (const job of jobs) {
    await db
      .update(notificationOutbox)
      .set({
        status: "processing",
        attempts: sql`${notificationOutbox.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(notificationOutbox.id, job.id));

    try {
      await deliverChatNotification({
        kind: job.kind as "seller_new_message" | "buyer_new_message",
        payload: job.payload as {
          messageId: string;
          conversationId: string;
        },
      });
      await db
        .update(notificationOutbox)
        .set({ status: "done", updatedAt: new Date(), lastError: null })
        .where(eq(notificationOutbox.id, job.id));
    } catch (err) {
      const attempts = job.attempts + 1;
      const delayMin = Math.min(60, 2 ** Math.min(attempts, 5));
      const next = new Date(Date.now() + delayMin * 60_000);
      await db
        .update(notificationOutbox)
        .set({
          status: attempts >= 8 ? "failed" : "pending",
          lastError: err instanceof Error ? err.message : "delivery failed",
          nextAttemptAt: next,
          updatedAt: new Date(),
        })
        .where(eq(notificationOutbox.id, job.id));
    }
  }

  return jobs.length;
}
