/**
 * Register Telegram webhook for the local/prod app URL.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   NEXT_PUBLIC_APP_URL=https://xxxx.ngrok.app \
 *   npx tsx scripts/set-webhook.ts
 */
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !base) {
    console.error("Need TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_APP_URL");
    process.exit(1);
  }

  const url = new URL("/api/bot", base).toString();
  const body: Record<string, unknown> = {
    url,
    allowed_updates: [
      "message",
      "callback_query",
      "channel_post",
      "edited_channel_post",
      "my_chat_member",
    ],
    drop_pending_updates: true,
  };
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(data);

  const info = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
  );
  console.log(await info.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
