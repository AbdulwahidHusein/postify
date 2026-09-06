import { sign } from "@tma.js/init-data-node";

async function main() {
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
        username: "ada",
      },
    },
    token,
    new Date(),
  );

  const login = await fetch(`${base}/api/auth/telegram-miniapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

  const create = await fetch(`${base}/api/shops`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: "Mint Closet",
      description: "Resale fashion",
    }),
  });
  const shopBody = (await create.json()) as {
    shop?: { id: string; slug: string };
    error?: string;
  };
  console.log("create shop", create.status, shopBody);

  const shopId = shopBody.shop?.id;
  if (!shopId) {
    throw new Error("No shop id");
  }

  const connect = await fetch(`${base}/api/channels/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ shopId }),
  });
  console.log("connect", connect.status, await connect.json());

  const list = await fetch(`${base}/api/channels/connect`, {
    headers: { cookie },
  });
  console.log("channels", list.status, await list.json());

  const bot = await fetch(`${base}/api/bot`);
  console.log("bot", bot.status, await bot.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
