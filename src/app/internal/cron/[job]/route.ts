import { log } from "@/server/log";
import { verifyInternalRequest } from "@/server/services/oidc";
import { nightly, sweep } from "@/server/jobs/scheduled";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 60 s fits every Vercel plan; the sweep stops starting new jobs after ~50 s.
export const maxDuration = 60;

/**
 * /internal/cron/sweep (every 5 min) and /internal/cron/nightly. Called by
 * Cloud Scheduler (POST + OIDC), Vercel Cron (GET + CRON_SECRET) or the
 * GitHub Actions schedule (POST + CRON_SECRET).
 */
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


export const GET = POST;
