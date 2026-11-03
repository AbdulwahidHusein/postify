import "server-only";

import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { appUrl, serverEnv } from "@/server/env";
import { z } from "zod";
import { db } from "@/server/db";
import { jobs, type JobRow } from "@/server/db/schema";
import { log } from "@/server/log";
import { toJson } from "@/server/http";
import { RetryLater } from "@/server/services/telegram";
import type { EnqueueOptions, EnqueueResult, QueueName } from "@/server/services/tasks";

/**
 * Postgres-backed job queue for serverless hosts (TASKS_MODE=db).
 *
 * - enqueue inserts a row (unique per queue+name, so retries and duplicate
 *   webhooks are dropped) and asks the current request to drain the queue
 *   after the response is sent (Next.js `after`).
 * - drain claims due rows with FOR UPDATE SKIP LOCKED, so any number of
 *   instances can drain at once without double-running a job.
 * - failures retry with exponential backoff (Telegram 429s use retry_after);
 *   a job that keeps failing is marked failed and reported to ops.
 * - a running job whose instance died is reclaimed when its lock expires.
 * - jobs run in priority order (ingest, buttons, notify, then media), so a
 *   slow photo album never holds back the Order button; photos in one batch
 *   are processed in parallel.
 * - when a request runs out of time with work still due, it hands off to a
 *   fresh invocation (/internal/cron/drain) instead of waiting for the sweep.
 * - the 5-minute sweep drains anything left (long delays, crashed instances).
 */

const MAX_ATTEMPTS: Record<QueueName, number> = { ingest: 20, media: 15, buttons: 25, notify: 10 };
const LOCK_SECONDS = 120;
const BATCH = 6;
/** Longest delay a request will wait for in-process; longer ones go to the sweep. */
const MAX_INLINE_WAIT_MS = 15_000;
/** Time a request spends draining after its response (route maxDuration is 60 s). */
export const DEFAULT_DRAIN_BUDGET_MS = 45_000;
/** How many fresh invocations a chain of hand-offs may start. */
const MAX_HOPS = 6;
/** Lower runs first. */
const PRIORITY = sql`case ${jobs.queue} when 'ingest' then 0 when 'buttons' then 1 when 'notify' then 2 else 3 end`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function enqueueDb(queue: QueueName, payload: Record<string, unknown>, opts: EnqueueOptions): Promise<EnqueueResult> {
  const runAt = new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000);
  const rows = await db
    .insert(jobs)
    .values({
      queue,
      name: opts.name ?? null,
      // Round-trip through JSON so handlers see exactly what was stored.
      payload: JSON.parse(toJson(payload)) as Record<string, unknown>,
      runAt,
    })
    .onConflictDoNothing({ target: [jobs.queue, jobs.name] })
    .returning({ id: jobs.id });
  if (!rows.length) return "duplicate";
  await kick((opts.delaySeconds ?? 0) * 1000);
  return "enqueued";
}

// ── draining ────────────────────────────────────────────────────────────────
let current: Promise<DrainStats> | null = null;
let again = false;

/** Ask this instance to drain soon: after the response when inside a request. */
async function kick(delayMs: number) {
  if (process.env.VITEST) return; // tests drain explicitly
  if (current) {
    again = true;
    return;
  }
  const run = async () => {
    // Stay inside the route's 60 s limit: time spent waiting comes off the budget.
    const waited = delayMs > 0 ? Math.min(delayMs, MAX_INLINE_WAIT_MS) : 0;
    if (waited) await sleep(waited);
    await drainSoon(DEFAULT_DRAIN_BUDGET_MS - waited);
  };
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    // Outside a request (scripts, local tools): run in the background.
    void run().catch((err) => log.error("job drain failed", { err }));
  }
}

function drainSoon(budgetMs = DEFAULT_DRAIN_BUDGET_MS, hop = 0): Promise<DrainStats> {
  if (current) {
    again = true;
    return current;
  }
  current = (async () => {
    const total: DrainStats = { ran: 0, done: 0, retried: 0, failed: 0 };
    const deadline = Date.now() + budgetMs;
    do {
      again = false;
      const s = await drainJobs({ budgetMs: Math.max(0, deadline - Date.now()) });
      total.ran += s.ran;
      total.done += s.done;
      total.retried += s.retried;
      total.failed += s.failed;
    } while (again && Date.now() < deadline);
    if (total.ran > 0 && hop < MAX_HOPS && (await workDueSoon())) await handOff(hop + 1);
    return total;
  })().finally(() => {
    current = null;
  });
  return current;
}

export type DrainStats = { ran: number; done: number; retried: number; failed: number };

/** Is anything due now or within the inline wait window? */
async function workDueSoon(): Promise<boolean> {
  const soon = new Date(Date.now() + MAX_INLINE_WAIT_MS);
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(or(and(eq(jobs.status, "pending"), lte(jobs.runAt, soon)), and(eq(jobs.status, "running"), lt(jobs.lockedUntil, new Date()))))
    .limit(1);
  return Boolean(row);
}

/**
 * Start a fresh invocation to keep draining. The receiving route answers at
 * once and drains after its response, so this only waits for the handshake.
 */
async function handOff(hop: number) {
  if (!serverEnv.CRON_SECRET) return;
  try {
    const res = await fetch(`${appUrl()}/internal/cron/drain`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.CRON_SECRET}`, "x-goods-hop": String(hop) },
      signal: AbortSignal.timeout(5000),
    });
    log.info("job drain handed off", { hop, status: res.status });
  } catch (err) {
    log.warn("job drain hand-off failed; the sweep will pick it up", { hop, err });
  }
}

// Loaded lazily (it pulls in every domain module) and once, so parallel jobs share it.
let jobsModule: Promise<typeof import("@/server/jobs")> | null = null;
const loadJobs = () => (jobsModule ??= import("@/server/jobs"));

async function claim(limit: number): Promise<JobRow[]> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_SECONDS * 1000);
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "pending"), lte(jobs.runAt, now)),
        and(eq(jobs.status, "running"), lt(jobs.lockedUntil, now)),
      ),
    )
    .orderBy(PRIORITY, asc(jobs.runAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(jobs)
    .set({ status: "running", lockedUntil, attempts: sql`${jobs.attempts} + 1` })
    .where(inArray(jobs.id, due))
    .returning();
}

function backoffSeconds(attempts: number) {
  return Math.min(5 * 2 ** Math.max(0, attempts - 1), 600);
}

async function runOne(job: JobRow): Promise<"done" | "retried" | "failed"> {
  const queue = job.queue as QueueName;
  const started = Date.now();
  try {
    const { runJob } = await loadJobs();
    await runJob(queue, job.payload);
    await db.update(jobs).set({ status: "done", finishedAt: new Date(), lockedUntil: null, lastError: null }).where(eq(jobs.id, job.id));
    log.info("job done", { job: queue, attempt: job.attempts, ms: Date.now() - started });
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const poison = err instanceof z.ZodError;
    const max = MAX_ATTEMPTS[queue] ?? 10;
    if (poison || job.attempts >= max) {
      await db
        .update(jobs)
        .set({ status: "failed", finishedAt: new Date(), lockedUntil: null, lastError: message.slice(0, 1000) })
        .where(eq(jobs.id, job.id));
      log.error("job failed permanently", { job: queue, attempt: job.attempts, err });
      try {
        const { notifyOps } = await import("@/server/domain/notify");
        await notifyOps(`Job ${queue} failed after ${job.attempts} attempts: ${message.slice(0, 200)}`, `job_failed:${job.id}`);
      } catch {
        // Ops alerts are best effort.
      }
      return "failed";
    }
    const wait = err instanceof RetryLater ? Math.max(1, err.retryAfterSeconds) : backoffSeconds(job.attempts);
    await db
      .update(jobs)
      .set({ status: "pending", runAt: new Date(Date.now() + wait * 1000), lockedUntil: null, lastError: message.slice(0, 1000) })
      .where(eq(jobs.id, job.id));
    log.warn("job failed, will retry", { job: queue, attempt: job.attempts, retry_in_s: wait, err });
    return "retried";
  }
}

/**
 * Run due jobs until none are due or the time budget is used. If the next job
 * is due within a few seconds (album grouping, short retries) and there is
 * budget left, wait for it instead of leaving it to the sweep.
 */
export async function drainJobs({ budgetMs = DEFAULT_DRAIN_BUDGET_MS, waitForSoon = true } = {}): Promise<DrainStats> {
  const stats: DrainStats = { ran: 0, done: 0, retried: 0, failed: 0 };
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const batch = await claim(BATCH);
    if (!batch.length) {
      if (!waitForSoon) break;
      const [next] = await db
        .select({ runAt: jobs.runAt })
        .from(jobs)
        .where(eq(jobs.status, "pending"))
        .orderBy(asc(jobs.runAt))
        .limit(1);
      const waitMs = next ? next.runAt.getTime() - Date.now() : Infinity;
      if (waitMs > MAX_INLINE_WAIT_MS || Date.now() + waitMs >= deadline) break;
      await sleep(Math.max(50, waitMs));
      continue;
    }
    // Photos are independent: process them side by side. Everything else
    // runs in order (button edits are spaced for Telegram's rate limits).
    const media = batch.filter((j) => j.queue === "media");
    for (const job of batch) {
      if (job.queue === "media") continue;
      stats.ran += 1;
      stats[await runOne(job)] += 1;
    }
    for (const result of await Promise.all(media.map(runOne))) {
      stats.ran += 1;
      stats[result] += 1;
    }
  }
  return stats;
}

/** Cron entry point: drain with a larger budget. `hop` counts hand-offs in a chain. */
export function drainFromCron(budgetMs = 50_000, hop = 0) {
  return drainSoon(budgetMs, hop);
}

/** Nightly: keep finished rows only as long as they are useful. */
export async function purgeJobs() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const twoWeeks = new Date(Date.now() - 14 * 86_400_000);
  await db.delete(jobs).where(and(eq(jobs.status, "done"), lt(jobs.finishedAt, dayAgo)));
  await db.delete(jobs).where(and(eq(jobs.status, "failed"), lt(jobs.finishedAt, twoWeeks)));
}

export async function jobCounts() {
  const rows = await db
    .select({ status: jobs.status, n: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<JobRow["status"], number>>;
}
