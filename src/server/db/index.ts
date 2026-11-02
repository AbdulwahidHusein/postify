import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { serverEnv } from "@/server/env";

export type Database = PostgresJsDatabase<typeof schema>;
/** A transaction handle has the same query surface as the database. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as {
  goodsSql?: ReturnType<typeof postgres>;
  /** Tests inject a PGlite-backed drizzle instance here. */
  goodsTestDb?: Database;
};

function createDb(): Database {
  if (globalForDb.goodsTestDb) return globalForDb.goodsTestDb;
  const sql =
    globalForDb.goodsSql ??
    postgres(serverEnv.DATABASE_URL, {
      // Neon's pooled endpoint (PgBouncer, transaction mode) needs prepare=false.
      max: serverEnv.DATABASE_POOL_MAX,
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 20,
    });
  globalForDb.goodsSql = sql;
  return drizzle(sql, { schema });
}

export const db: Database = new Proxy({} as Database, {
  // Resolve lazily so tests can inject a database before first use.
  get(_target, prop) {
    const real = globalForDb.goodsTestDb ?? (cachedDb ??= createDb());
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

let cachedDb: Database | undefined;

export { schema };
