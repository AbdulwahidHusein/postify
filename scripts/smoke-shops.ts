import { sign } from "@tma.js/init-data-node";

const token = process.env.TELEGRAM_BOT_TOKEN;
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

async function main() {
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
  console.log("create", create.status, await create.json());

  const list = await fetch(`${base}/api/shops`, { headers: { cookie } });
  console.log("list", list.status, await list.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
