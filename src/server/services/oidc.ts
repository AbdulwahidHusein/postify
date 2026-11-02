import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import { isProduction, serverEnv } from "@/server/env";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Authenticate a Cloud Tasks / Cloud Scheduler push: a Google-signed OIDC
 * token for our service account with our audience, or (Vercel) the shared
 * CRON_SECRET as a Bearer token. In local dev (never in production) a shared
 * INTERNAL_DEV_SECRET header is accepted too.
 */
export async function verifyInternalRequest(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!isProduction && serverEnv.INTERNAL_DEV_SECRET) {
    const dev = request.headers.get("x-internal-secret") ?? "";
    if (dev && safeEqual(dev, serverEnv.INTERNAL_DEV_SECRET)) return true;
  }
  if (!token) return false;

  // Vercel Cron and the GitHub Actions schedule send CRON_SECRET as a Bearer token.
  if (serverEnv.CRON_SECRET && safeEqual(token, serverEnv.CRON_SECRET)) return true;

  const audience = serverEnv.TASKS_AUDIENCE || serverEnv.TASKS_TARGET_URL.replace(/\/$/, "");
  if (!audience || !serverEnv.TASKS_SERVICE_ACCOUNT) return false;

  try {
    const { payload } = await jwtVerify(token, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    return payload.email === serverEnv.TASKS_SERVICE_ACCOUNT && payload.email_verified === true;
  } catch {
    return false;
  }
}
