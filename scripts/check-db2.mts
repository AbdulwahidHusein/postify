import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)![1].trim();
const sql = postgres(url, { max: 1, prepare: false });
(async () => {
  const channels = await sql`SELECT c.id, c.status, c.telegram_chat_id, c.title, c.username, c.shop_id, s.name as shop_name, s.slug FROM channels c LEFT JOIN shops s ON s.id = c.shop_id ORDER BY c.created_at DESC`;
  console.log("=== ALL CHANNELS ===");
  for (const c of channels) {
    console.log(`[${c.status}] ${c.title} chat=${c.telegram_chat_id} user=@${c.username || 'none'} shop=${c.shop_name}`);
  }

  // Check shop settings/ingestMode
  const shops = await sql`SELECT name, slug, settings FROM shops ORDER BY created_at DESC`;
  console.log("\n=== SHOPS ===");
  for (const s of shops) {
    const settings = typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings;
    console.log(`${s.name} (${s.slug}): ingestMode=${settings?.ingestMode ?? 'n/a'} autoPublish=${settings?.autoPublishMinConfidence ?? 'n/a'} shopVisible=${settings?.shopVisible ?? 'n/a'}`);
  }
  await sql.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
