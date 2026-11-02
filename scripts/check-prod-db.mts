import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)![1].trim();
const sql = postgres(url, { max: 1, prepare: false });
(async () => {
  // Test if the new columns are queryable
  try {
    const r = await sql`SELECT condition, brand, model, location, attributes, is_negotiable, shipping_info, return_policy FROM products LIMIT 1`;
    console.log("NEW COLUMNS: OK — all queryable");
    console.log("Sample:", JSON.stringify(r[0]).slice(0, 300));
  } catch (e: any) {
    console.log("NEW COLUMNS: ERROR —", e.message);
  }
  await sql.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
