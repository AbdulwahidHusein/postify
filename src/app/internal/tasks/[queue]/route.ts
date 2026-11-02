import { z } from "zod";
import { log } from "@/server/log";
import { verifyInternalRequest } from "@/server/services/oidc";
import { RetryLater } from "@/server/services/telegram";
import { runJob } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const queues = z.enum(["ingest", "media", "buttons", "notify"]);

/**
 * Cloud Tasks target. 2xx = done; 5xx = Cloud Tasks retries with backoff.
 * Invalid payloads return 200 so a poison message is not retried forever.
 */
export async function POST(request: Request, ctx: { params: Promise<{ queue: string }> }) {
  if (!(await verifyInternalRequest(request))) return new Response("forbidden", { status: 403 });
  const parsed = queues.safeParse((await ctx.params).queue);
  if (!parsed.success) return new Response("unknown queue", { status: 404 });
  const queue = parsed.data;
  const attempt = request.headers.get("x-cloudtasks-taskretrycount") ?? "0";

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("invalid payload", { status: 200 });
  }

  const started = Date.now();
  try {
    const result = await runJob(queue, payload);
    log.info("job done", { job: queue, attempt, ms: Date.now() - started, result });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      log.error("job payload invalid", { job: queue, err: err.message });
      return new Response("invalid payload", { status: 200 });
    }
    const retryAfter = err instanceof RetryLater ? err.retryAfterSeconds : undefined;
    log.warn("job failed, will retry", { job: queue, attempt, err });
    return new Response("retry", { status: 503, headers: retryAfter ? { "Retry-After": String(retryAfter) } : {} });
  }
}
