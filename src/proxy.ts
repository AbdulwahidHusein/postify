import { NextResponse, type NextRequest } from "next/server";

const ROOT = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase().split(":")[0];
const RESERVED = new Set(["www", "app", "api", "admin", "img", "static", "cdn"]);
const PASSTHROUGH = /^\/(?:_next|api|internal|auth|go|favicon\.ico)(?:\/|$)/;

/**
 * Multi-tenant routing. `shop.goods.et/...` and custom domains are rewritten
 * to the storefront routes under /s/<shop>; the platform domain is untouched.
 * The router Worker forwards the original host in X-Forwarded-Host.
 */
export function proxy(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = raw.toLowerCase().split(",")[0].trim().split(":")[0];
  const { pathname } = request.nextUrl;
  // The store customizer's preview frame loads pages with ?goods_preview; the
  // storefront then renders the draft (if the signed preview cookie matches).
  const headers = new Headers(request.headers);
  headers.delete("x-goods-preview");
  if (request.nextUrl.searchParams.has("goods_preview")) headers.set("x-goods-preview", "1");

  if (
    !host ||
    host === ROOT ||
    host === `www.${ROOT}` ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".run.app") ||
    host.endsWith(".vercel.app") ||
    PASSTHROUGH.test(pathname)
  ) {
    return NextResponse.next({ request: { headers } });
  }

  let shopParam: string | null = null;
  if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    if (!sub.includes(".") && !RESERVED.has(sub)) shopParam = sub;
  } else {
    shopParam = `__host__${host}`;
  }
  if (!shopParam) return NextResponse.next({ request: { headers } });

  const url = request.nextUrl.clone();
  url.pathname = `/s/${encodeURIComponent(shopParam)}${pathname === "/" ? "" : pathname}`;
  headers.set("x-goods-base", "");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
