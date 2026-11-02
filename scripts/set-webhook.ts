/**
 * Register the bot webhook, commands and menu button.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   NEXT_PUBLIC_APP_URL=https://goods.et \
 *   npx tsx scripts/set-webhook.ts [--keep-pending]
 *
 * Re-run after changing the domain. Safe to run repeatedly.
 */
import "./load-env";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
  "my_chat_member",
  "chat_member",
];

async function call(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`${method} failed: ${data.description}`);
  return data.result;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !base || !secret) {
    console.error("Need TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL");
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    console.error("TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and - (max 256)");
    process.exit(1);
  }

  const url = new URL("/api/telegram/webhook", base).toString();
  await call(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
    max_connections: 40,
    drop_pending_updates: !process.argv.includes("--keep-pending"),
  });
  console.log(`webhook → ${url}`);

  const commands = (lang: "en" | "am") =>
    lang === "am"
      ? [
          { command: "start", description: "ሱቅ ይክፈቱ ወይም ቻናል ያገናኙ" },
          { command: "status", description: "የሱቅዎ ሁኔታ" },
          { command: "help", description: "እገዛ" },
        ]
      : [
          { command: "start", description: "Open your shop or connect a channel" },
          { command: "status", description: "Shop and channel status" },
          { command: "help", description: "How Goods works" },
        ];
  await call(token, "setMyCommands", { commands: commands("en") });
  await call(token, "setMyCommands", { commands: commands("am"), language_code: "am" });

  // Default menu (commands) — primary flows use plain https buttons, not Mini App.
  await call(token, "setChatMenuButton", {
    menu_button: { type: "default" },
  });

  console.log(await call(token, "getWebhookInfo", {}));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
