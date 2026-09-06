/**
 * Dev smoke: signs fake Mini App initData and exercises auth APIs.
 * Usage: TELEGRAM_BOT_TOKEN=123456:TEST npx tsx scripts/smoke-auth.ts
 */
import { sign } from "@tma.js/init-data-node";

const token = process.env.TELEGRAM_BOT_TOKEN;
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const initData = sign(
  {
    user: {
      id: 424242,
      first_name: "Ada",
      last_name: "Lovelace",
      username: "ada",
      language_code: "en",
      is_premium: true,
    },
  },
  token,
  new Date(),
);

async function main() {
  const login = await fetch(`${base}/api/auth/telegram-miniapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const loginBody = await login.json();
  console.log("login", login.status, loginBody);

  const cookie = login.headers.getSetCookie?.() ?? [];
  const cookieHeader = cookie.map((c) => c.split(";")[0]).join("; ");

  const me = await fetch(`${base}/api/auth/me`, {
    headers: { cookie: cookieHeader },
  });
  console.log("me", me.status, await me.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
