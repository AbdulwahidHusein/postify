import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";

/**
 * Fresh in-memory Postgres per test file, migrated with the real migrations.
 * Injected into the app's db proxy via globalThis.goodsTestDb.
 */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  (globalThis as { goodsTestDb?: unknown }).goodsTestDb = db;
  return db as unknown as Database;
}
