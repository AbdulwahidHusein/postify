import "server-only";

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox, type NotificationOutbox } from "@/db/schema";
import {
  deliverChatNotification,
  deliverOrderNotification,
} from "@/lib/chat/telegram-bridge";

export type OutboxKind =
  | "seller_new_message"
  | "buyer_new_message"
  | "seller_new_order"
  | "ingest_channel_post";

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

  // Await so serverless/dev doesn't drop the flush after the HTTP response.
  // flushOutbox is scoped to notification kinds — it never runs the LLM-backed
  // ingest jobs, so this stays fast.
  await flushOutbox(8).catch((err) => {
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

  await flushOutbox(8).catch((err) => {
    console.warn("[orders] outbox flush failed", err);
  });
}

/**
 * Claim a batch of outbox jobs and run each through `run`, with atomic claim
 * (no double-processing across concurrent flushers) and exponential-backoff
 * retries. Shared by the notification flush and the ingest flush.
 */
export async function processOutboxJobs(
  jobs: NotificationOutbox[],
  run: (job: NotificationOutbox) => Promise<void>,
): Promise<number> {
  let processed = 0;

  for (const job of jobs) {
    // Atomic claim: only one concurrent flusher transitions pending → processing.
    // Without `status = 'pending'` in the WHERE, two flushers (webhook tail +
    // cron) both select the same row and both deliver → double notifications.
    const claimed = await db
      .update(notificationOutbox)
      .set({
        status: "processing",
        attempts: sql`${notificationOutbox.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationOutbox.id, job.id),
          eq(notificationOutbox.status, "pending"),
        ),
      )
      .returning();
    if (claimed.length === 0) continue; // someone else already claimed it
    processed += 1;

    try {
      await run(job);
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

  return processed;
}

/** Flush Telegram *notification* jobs only (chat + orders). Never ingest. */
export async function flushOutbox(limit = 20) {
  const now = new Date();
  // Prefer order notifies so deal alerts aren't starved by older chat retries.
  const orderJobs = await db.query.notificationOutbox.findMany({
    where: and(
      eq(notificationOutbox.status, "pending"),
      eq(notificationOutbox.kind, "seller_new_order"),
      lte(notificationOutbox.nextAttemptAt, now),
    ),
    orderBy: [asc(notificationOutbox.createdAt)],
    limit,
  });
  const remaining = Math.max(0, limit - orderJobs.length);
  const otherJobs =
    remaining > 0
      ? await db.query.notificationOutbox.findMany({
          where: and(
            eq(notificationOutbox.status, "pending"),
            inArray(notificationOutbox.kind, [
              "seller_new_message",
              "buyer_new_message",
            ]),
            lte(notificationOutbox.nextAttemptAt, now),
          ),
          orderBy: [asc(notificationOutbox.createdAt)],
          limit: remaining,
        })
      : [];
  const jobs = [...orderJobs, ...otherJobs];

  return processOutboxJobs(jobs, async (job) => {
    if (job.kind === "seller_new_order") {
      await deliverOrderNotification({
        orderId: String(
          (job.payload as { orderId?: string }).orderId ?? "",
        ),
      });
      return;
    }
    await deliverChatNotification({
      kind: job.kind as "seller_new_message" | "buyer_new_message",
      payload: job.payload as {
        messageId: string;
        conversationId: string;
      },
    });
  });
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
