import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { db } from "@/server/db";
import { jobs } from "@/server/db/schema";
import { RetryLater } from "@/server/services/telegram";

const runJob = vi.fn<(queue: string, payload: Record<string, unknown>) => Promise<unknown>>();
vi.mock("@/server/jobs", () => ({ runJob: (q: string, p: Record<string, unknown>) => runJob(q, p) }));

const { enqueueDb, drainJobs, purgeJobs } = await import("@/server/services/job-queue");

beforeAll(async () => {
  await createTestDb();
});
beforeEach(async () => {
  runJob.mockReset();
  runJob.mockResolvedValue(undefined);
  await db.delete(jobs);
});
afterAll(() => vi.restoreAllMocks());

const row = async (name: string) => (await db.select().from(jobs).where(eq(jobs.name, name)))[0];

describe("Postgres job queue", () => {
  it("runs a job once and de-duplicates by name, even after it finished", async () => {
    expect(await enqueueDb("ingest", { groupKey: "g1" }, { name: "g1" })).toBe("enqueued");
    expect(await enqueueDb("ingest", { groupKey: "g1" }, { name: "g1" })).toBe("duplicate");
    const s = await drainJobs({ waitForSoon: false });
    expect(s).toMatchObject({ ran: 1, done: 1 });
    expect(runJob).toHaveBeenCalledWith("ingest", { groupKey: "g1" });
    expect(await enqueueDb("ingest", { groupKey: "g1" }, { name: "g1" })).toBe("duplicate");
    expect((await row("g1")).status).toBe("done");
  });

  it("allows the same name on different queues and unnamed jobs freely", async () => {
    await enqueueDb("media", { imageId: "a" }, { name: "x" });
    await enqueueDb("buttons", { sourceId: "a" }, { name: "x" });
    await enqueueDb("notify", { kind: "ops" }, {});
    await enqueueDb("notify", { kind: "ops" }, {});
    expect((await drainJobs({ waitForSoon: false })).done).toBe(4);
  });

  it("runs ingest and buttons before photos, and photos side by side", async () => {
    const order: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    runJob.mockImplementation(async (q) => {
      order.push(q);
      if (q === "media") {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight -= 1;
      }
    });
    for (const i of [1, 2, 3]) await enqueueDb("media", { imageId: `m${i}` }, { name: `m${i}` });
    await enqueueDb("buttons", { sourceId: "s1" }, { name: "b1" });
    await enqueueDb("ingest", { groupKey: "g" }, { name: "i1" });
    expect((await drainJobs({ waitForSoon: false })).done).toBe(5);
    expect(order.slice(0, 2)).toEqual(["ingest", "buttons"]);
    expect(maxInFlight).toBe(3);
  });

  it("holds delayed jobs until due, and waits for soon-due jobs when allowed", async () => {
    await enqueueDb("ingest", { groupKey: "album" }, { name: "album", delaySeconds: 1 });
    expect((await drainJobs({ waitForSoon: false })).ran).toBe(0);
    const s = await drainJobs({ budgetMs: 5000 });
    expect(s.done).toBe(1);
  });

  it("retries with backoff, honours Telegram retry_after, then fails permanently", async () => {
    runJob.mockRejectedValueOnce(new Error("network down"));
    await enqueueDb("notify", { kind: "x" }, { name: "n1" });
    expect((await drainJobs({ waitForSoon: false })).retried).toBe(1);
    let j = await row("n1");
    expect(j.status).toBe("pending");
    expect(j.attempts).toBe(1);
    expect(j.lastError).toContain("network down");
    expect(j.runAt.getTime() - Date.now()).toBeGreaterThan(3000);

    // Rate limited by Telegram: next run respects retry_after.
    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, j.id));
    runJob.mockRejectedValueOnce(new RetryLater("Too Many Requests", 42));
    await drainJobs({ waitForSoon: false });
    j = await row("n1");
    expect(Math.round((j.runAt.getTime() - Date.now()) / 1000)).toBeGreaterThanOrEqual(40);

    // Exhaust the attempts (notify allows 10).
    runJob.mockRejectedValue(new Error("still broken"));
    for (let i = 0; i < 10; i += 1) {
      await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, j.id));
      await drainJobs({ waitForSoon: false });
    }
    j = await row("n1");
    expect(j.status).toBe("failed");
    expect(j.attempts).toBe(10);
  });

  it("fails a poison payload immediately instead of retrying it", async () => {
    const { z } = await import("zod");
    runJob.mockImplementationOnce(async () => z.object({ a: z.string() }).parse({}));
    await enqueueDb("media", {}, { name: "poison" });
    await drainJobs({ waitForSoon: false });
    expect((await row("poison")).status).toBe("failed");
  });

  it("reclaims a job whose instance died mid-run", async () => {
    await enqueueDb("media", { imageId: "z" }, { name: "crash" });
    await db.update(jobs).set({ status: "running", lockedUntil: new Date(Date.now() - 1000), attempts: 1 }).where(eq(jobs.name, "crash"));
    const s = await drainJobs({ waitForSoon: false });
    expect(s.done).toBe(1);
    expect((await row("crash")).attempts).toBe(2);
  });

  it("leaves a job alone while another instance holds its lock", async () => {
    await enqueueDb("media", { imageId: "y" }, { name: "busy" });
    await db.update(jobs).set({ status: "running", lockedUntil: new Date(Date.now() + 60_000) }).where(eq(jobs.name, "busy"));
    expect((await drainJobs({ waitForSoon: false })).ran).toBe(0);
  });

  it("purges finished jobs after a day", async () => {
    await enqueueDb("media", { imageId: "old" }, { name: "old" });
    await drainJobs({ waitForSoon: false });
    await db.update(jobs).set({ finishedAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(jobs.name, "old"));
    await purgeJobs();
    expect(await row("old")).toBeUndefined();
  });
});
