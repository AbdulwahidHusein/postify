import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox } from "@/db/schema";
import {
  deliverChatNotification,
  deliverOrderNotification,
} from "@/lib/chat/telegram-bridge";

export type OutboxKind =
  | "seller_new_message"
  | "buyer_new_message"
  | "seller_new_order";

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

  void flushOutbox(8).catch((err) => {
    console.warn("[chat] outbox flush failed", err);
  });
}

export async function enqueueOrderNotify(input: { orderId: string }) {
  await db.insert(notificationOutbox).values({
    kind: "seller_new_order",
    payload: { orderId: input.orderId },
    status: "pending",
    nextAttemptAt: new Date(),
  });

  void flushOutbox(8).catch((err) => {
    console.warn("[orders] outbox flush failed", err);
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
      if (job.kind === "seller_new_order") {
        await deliverOrderNotification({
          orderId: String(
            (job.payload as { orderId?: string }).orderId ?? "",
          ),
        });
      } else {
        await deliverChatNotification({
          kind: job.kind as "seller_new_message" | "buyer_new_message",
          payload: job.payload as {
            messageId: string;
            conversationId: string;
          },
        });
      }
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

/** Stuck "processing" rows after crash — reclaim as pending. */
export async function reclaimStaleOutbox(olderThanMs = 5 * 60_000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  await db
    .update(notificationOutbox)
    .set({
      status: "pending",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
      lastError: "reclaimed after stale processing",
    })
    .where(
      and(
        eq(notificationOutbox.status, "processing"),
        lte(notificationOutbox.updatedAt, cutoff),
      ),
    );
}
