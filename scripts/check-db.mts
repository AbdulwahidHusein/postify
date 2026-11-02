import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)![1].trim();
const sql = postgres(url, { max: 1, prepare: false });

(async () => {
  // Check columns exist on products
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position`;
  console.log("=== products columns ===");
  console.log(cols.map((c: any) => c.column_name).join(", "));

  // Recent outbox
  const outbox = await sql`SELECT kind, status, attempts, last_error, created_at FROM notification_outbox ORDER BY created_at DESC LIMIT 8`;
  console.log("\n=== OUTBOX (recent 8) ===");
  for (const r of outbox) {
    console.log(`[${r.status}] ${r.kind} attempts=${r.attempts} ${new Date(r.created_at).toISOString()} err=${(r.last_error || "").slice(0, 180)}`);
  }

  // Recent products
  const products = await sql`SELECT title, status, source_message_id, created_at FROM products ORDER BY created_at DESC LIMIT 5`;
  console.log("\n=== PRODUCTS (recent 5) ===");
  for (const p of products) {
    console.log(`[${p.status}] ${p.title} msg=${p.source_message_id} ${new Date(p.created_at).toISOString()}`);
  }

  // Connected channels
  const channels = await sql`SELECT title, status, telegram_chat_id FROM channels WHERE status = 'connected'`;
  console.log("\n=== CONNECTED CHANNELS ===");
  for (const c of channels) {
    console.log(`[${c.status}] ${c.title} chat=${c.telegram_chat_id}`);
  }
  await sql.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
