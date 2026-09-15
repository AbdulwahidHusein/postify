import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { serverEnv } from "@/lib/env.server";

/**
 * POST /api/migrate
 *
 * Idempotently applies pending schema changes (ADD COLUMN IF NOT EXISTS).
 * Protected by CRON_SECRET. Call once after deploying schema changes when
 * the production database hasn't been migrated yet.
 *
 * This is a stopgap until proper migration tooling (drizzle-kit push against
 * the production DATABASE_URL) is wired into the deploy pipeline.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = serverEnv.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statements = [
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS condition text`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS model text`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS location text`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes jsonb DEFAULT '{}'::jsonb`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_negotiable boolean NOT NULL DEFAULT false`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS shipping_info text`,
    sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS return_policy text`,
  ];

  const results: string[] = [];
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
      results.push("ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      results.push(`error: ${msg}`);
    }
  }

  return NextResponse.json({ applied: results });
}
