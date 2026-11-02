/**
 * Apply pending SQL migrations from ./drizzle.
 *
 * Runs as a Cloud Run Job before each deploy (see infra/setup.sh and
 * .github/workflows/deploy.yml), or locally:
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
 *
 * Uses a direct (non-pooled) connection: Neon's pooler doesn't support the
 * session-level advisory lock drizzle takes while migrating.
 */
import "./load-env";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is required");
    process.exit(1);
  }
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const started = Date.now();
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log(`migrations applied in ${Date.now() - started} ms`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
