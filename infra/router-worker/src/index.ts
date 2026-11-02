/**
 * Goods edge router (Cloudflare Worker).
 *
 * Routes goods.et, *.goods.et and merchants' custom domains (Cloudflare for
 * SaaS custom hostnames) to the Cloud Run web service, preserving the
 * original host in X-Forwarded-Host so src/proxy.ts can pick the shop.
 *
 * Caching: hashed Next.js assets are cached at the edge for a year. HTML and
 * API responses pass through untouched (they carry per-user state).
 */
export interface Env {
  ORIGIN: string; // e.g. https://goods-123456789.europe-west1.run.app
  /** Comma-separated hosts served by their own origin (e.g. the R2 image domain). */
  BYPASS_HOSTS?: string;
}

const IMMUTABLE = /^\/_next\/static\//;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = new URL(env.ORIGIN);

    // e.g. img.goods.et → R2 custom domain; same-zone subrequests skip this Worker.
    const bypass = (env.BYPASS_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (bypass.includes(url.hostname.toLowerCase())) return fetch(request);

    // Never expose the internal job endpoints through the edge.
    if (url.pathname.startsWith("/internal/")) return new Response("not found", { status: 404 });

    const target = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-real-ip", ip);

    const init: RequestInit = {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    };

    if (request.method === "GET" && IMMUTABLE.test(url.pathname)) {
      const cache = caches.default;
      const key = new Request(url.toString(), { method: "GET" });
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(target, init);
      if (res.ok) {
        const copy = new Response(res.body, res);
        copy.headers.set("cache-control", "public, max-age=31536000, immutable");
        ctx.waitUntil(cache.put(key, copy.clone()));
        return copy;
      }
      return res;
    }

    const res = await fetch(target, init);
    // Rewrite absolute redirects that point at the run.app host back to the edge host.
    const location = res.headers.get("location");
    if (location && location.startsWith(origin.origin)) {
      const out = new Response(res.body, res);
      out.headers.set("location", `https://${url.host}${location.slice(origin.origin.length)}`);
      return out;
    }
    return res;
  },
};
