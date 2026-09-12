import "server-only";

type Bucket = { count: number; resetAt: number };

// In-memory fixed-window counters, keyed by an opaque string (e.g. "auth:<ip>").
// Per-process: effective on a single-instance host; approximate on serverless
// (each instance has its own counters) — still raises the bar from zero.
const buckets = new Map<string, Bucket>();
const PRUNE_AT = 10_000;

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  if (buckets.size > PRUNE_AT) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(opts.key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(opts.key, { count: 1, resetAt });
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return {
    ok: true,
    remaining: opts.limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}
