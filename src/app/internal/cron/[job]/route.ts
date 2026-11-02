import { log } from "@/server/log";
import { verifyInternalRequest } from "@/server/services/oidc";
import { nightly, sweep } from "@/server/jobs/scheduled";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Cloud Scheduler targets: /internal/cron/sweep (every 5 min) and /internal/cron/nightly. */
export async function POST(request: Request, ctx: { params: Promise<{ job: string }> }) {
  if (!(await verifyInternalRequest(request))) return new Response("forbidden", { status: 403 });
  const { job } = await ctx.params;
  try {
    if (job === "sweep") return Response.json(await sweep());
    if (job === "nightly") return Response.json(await nightly());
    return new Response("unknown job", { status: 404 });
  } catch (err) {
    log.error("cron failed", { job, err });
    return new Response("failed", { status: 500 });
  }
}
