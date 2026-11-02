import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)![1].trim();
const sql = postgres(url, { max: 1, prepare: false });
(async () => {
  const outbox = await sql`SELECT kind, status, payload, last_error, created_at FROM notification_outbox WHERE kind = 'ingest_channel_post' ORDER BY created_at DESC LIMIT 5`;
  console.log("=== INGEST OUTBOX ENTRIES ===");
  for (const r of outbox) {
    console.log(`[${r.status}] ${r.kind} ${new Date(r.created_at).toISOString()} err=${(r.last_error || '').slice(0, 200)}`);
    console.log(`  payload: ${JSON.stringify(r.payload).slice(0, 200)}`);
  }
  if (outbox.length === 0) console.log("NO ingest_channel_post entries found!");
  await sql.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
