import "server-only";

import { serverEnv } from "@/server/env";
import { sha256 } from "@/server/ids";
import { log } from "@/server/log";
import { toJson } from "@/server/http";

export type QueueName = "ingest" | "media" | "buttons" | "notify";

export type EnqueueOptions = {
  /** Dedup key: a second enqueue with the same name is dropped. */
  name?: string;
  delaySeconds?: number;
};

export type EnqueueResult = "enqueued" | "duplicate";

/**
 * Enqueue a background job. Payloads carry ids only (Cloud Tasks caps a task
 * at 100 KB); handlers load state from the database and are idempotent.
 */
export async function enqueue(
  queue: QueueName,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  if (serverEnv.TASKS_MODE === "cloud") return enqueueCloud(queue, payload, opts);
  if (serverEnv.TASKS_MODE === "db") {
    const { enqueueDb } = await import("@/server/services/job-queue");
    return enqueueDb(queue, payload, opts);
  }
  return enqueueInline(queue, payload, opts);
}

// ── Cloud Tasks (production) ────────────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;

async function metadataToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) },
  );
  if (!res.ok) throw new Error(`metadata token failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function enqueueCloud(
  queue: QueueName,
  payload: Record<string, unknown>,
  opts: EnqueueOptions,
): Promise<EnqueueResult> {
  const { TASKS_PROJECT, TASKS_LOCATION, TASKS_TARGET_URL, TASKS_SERVICE_ACCOUNT } = serverEnv;
  if (!TASKS_PROJECT || !TASKS_TARGET_URL || !TASKS_SERVICE_ACCOUNT) {
    throw new Error("Cloud Tasks is not configured (TASKS_PROJECT, TASKS_TARGET_URL, TASKS_SERVICE_ACCOUNT)");
  }
  const parent = `projects/${TASKS_PROJECT}/locations/${TASKS_LOCATION}/queues/${queue}`;
  const base = TASKS_TARGET_URL.replace(/\/$/, "");
  const task: Record<string, unknown> = {
    httpRequest: {
      httpMethod: "POST",
      url: `${base}/internal/tasks/${queue}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(toJson(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: TASKS_SERVICE_ACCOUNT,
        audience: serverEnv.TASKS_AUDIENCE || base,
      },
    },
    dispatchDeadline: "300s",
  };
  // Hashed ids spread evenly across Cloud Tasks' keyspace (recommended).
  if (opts.name) task.name = `${parent}/tasks/${sha256(`${queue}:${opts.name}`)}`;
  if (opts.delaySeconds && opts.delaySeconds > 0) {
    task.scheduleTime = new Date(Date.now() + opts.delaySeconds * 1000).toISOString();
  }

  const res = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await metadataToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task }),
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 409) return "duplicate";
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloud Tasks enqueue failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return "enqueued";
}

// ── Inline (local dev and tests) ────────────────────────────────────────────
type InlineTask = {
  queue: QueueName;
  payload: Record<string, unknown>;
  runAt: number;
  attempts: number;
};

const g = globalThis as unknown as {
  goodsInlineTasks?: InlineTask[];
  goodsInlineNames?: Set<string>;
};
const inlineQueue = (g.goodsInlineTasks ??= []);
const inlineNames = (g.goodsInlineNames ??= new Set());
const autoRun = !process.env.VITEST;

async function enqueueInline(
  queue: QueueName,
  payload: Record<string, unknown>,
  opts: EnqueueOptions,
): Promise<EnqueueResult> {
  if (opts.name) {
    const key = `${queue}:${opts.name}`;
    if (inlineNames.has(key)) return "duplicate";
    inlineNames.add(key);
  }
  // Round-trip through JSON so handlers see what Cloud Tasks would deliver.
  const task: InlineTask = {
    queue,
    payload: JSON.parse(toJson(payload)) as Record<string, unknown>,
    runAt: Date.now() + (opts.delaySeconds ?? 0) * 1000,
    attempts: 0,
  };
  inlineQueue.push(task);
  if (autoRun) scheduleInline(task);
  return "enqueued";
}

function scheduleInline(task: InlineTask) {
  const wait = Math.max(0, task.runAt - Date.now());
  setTimeout(() => void runInline(task), wait);
}

async function runInline(task: InlineTask): Promise<void> {
  const idx = inlineQueue.indexOf(task);
  if (idx === -1) return;
  inlineQueue.splice(idx, 1);
  const { runJob } = await import("@/server/jobs");
  try {
    await runJob(task.queue, task.payload);
  } catch (err) {
    task.attempts += 1;
    if (task.attempts < 4) {
      task.runAt = Date.now() + 2 ** task.attempts * 1000;
      inlineQueue.push(task);
      if (autoRun) scheduleInline(task);
    } else {
      log.error("inline task failed permanently", { queue: task.queue, err });
    }
  }
}

/** Tests: run every queued task (ignoring delays) until the queue is empty. */
export async function drainInlineTasks(maxRuns = 500): Promise<number> {
  let runs = 0;
  while (inlineQueue.length && runs < maxRuns) {
    inlineQueue.sort((a, b) => a.runAt - b.runAt);
    const task = inlineQueue[0];
    runs += 1;
    await runInline(task);
  }
  return runs;
}

export function resetInlineTasks() {
  inlineQueue.length = 0;
  inlineNames.clear();
}

export function pendingInlineTasks(): readonly InlineTask[] {
  return inlineQueue;
}
