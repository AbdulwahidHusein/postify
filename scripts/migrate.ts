/**
 * Apply pending SQL migrations from ./drizzle.
 *
 * Runs on Vercel as part of `npm run vercel-build`, as a Cloud Run Job before
 * each deploy, or locally:
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
 *
 * Prefer DATABASE_URL_DIRECT (Neon non-pooled). The pooler can fail the
 * session advisory lock drizzle takes while migrating.
 *
 * Goods v2 is a new schema. If the database still has the old Postify
 * tables (and no Goods drizzle journal), this script wipes schema `public`
 * once and applies migrations. Force anytime with GOODS_DB_RESET=1.
 */
import "./load-env";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

function wantsForcedReset() {
  const v = (process.env.GOODS_DB_RESET ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function prepareDatabase(sql: postgres.Sql) {
  const [{ hasMigrations }] = await sql<{ hasMigrations: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations'
        AND table_schema IN ('public', 'drizzle')
    ) AS "hasMigrations"
  `;

  const [{ isLegacyPostify }] = await sql<{ isLegacyPostify: boolean }[]>`
    SELECT (
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'notification_outbox'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'jobs'
      )
    ) AS "isLegacyPostify"
  `;

  const reset = wantsForcedReset() || (!hasMigrations && isLegacyPostify);
  if (!reset) return;

  if (isLegacyPostify) {
    console.warn(
      "[migrate] Detected old Postify schema — dropping public and applying Goods v2 migrations (destructive)",
    );
  } else {
    console.warn(
      "[migrate] GOODS_DB_RESET=1 — dropping schema public and re-applying migrations",
    );
  }

  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO public");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO current_user");
  // Old drizzle journal (if any) would otherwise skip 0000_init on an empty public schema.
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
}

async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is required");
    process.exit(1);
  }
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await prepareDatabase(client);
    const started = Date.now();
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log(`migrations applied in ${Date.now() - started} ms`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
