import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env.server";

const globalForDb = globalThis as unknown as {
  postifySql?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(serverEnv.DATABASE_URL, {
    max: 10,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
  });
}

const sql = globalForDb.postifySql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.postifySql = sql;
}

export const db = drizzle(sql, { schema });
