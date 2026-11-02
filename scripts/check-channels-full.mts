import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)![1].trim();
const sql = postgres(url, { max: 1, prepare: false });
(async () => {
  const channels = await sql`SELECT id, status, telegram_chat_id, title, shop_id FROM channels ORDER BY created_at DESC`;
  console.log("=== ALL CHANNELS (local DB) ===");
  for (const c of channels) {
    console.log(`[${c.status}] ${c.title} chat=${c.telegram_chat_id} shop=${c.shop_id}`);
  }

  // Check what the production DB sees by hitting the bot webhook's internal channel lookup
  // The webhook on Vercel uses the PRODUCTION database, not our local one.
  // Let's check if our local DB is actually different from prod.
  console.log("\nLocal DB URL:", url.replace(/:[^:@]+@/, ':***@'));
  await sql.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
