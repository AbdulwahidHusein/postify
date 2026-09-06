# Postify

Turn Telegram channels into ecommerce storefronts.

Sellers post products in Telegram → bot extracts structured data → publishes to a **website** and **Telegram Mini App** → buyers open products from Telegram or the browser.

## Docs

| Doc | Contents |
|-----|----------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Problem, solution, users |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design + Telegram constraints |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Stack & env vars |
| [docs/PHASED_PLAN.md](docs/PHASED_PLAN.md) | Phases 0–9 |

## Status

**Phase 4 — Bot + channel connect** complete (code).

- Phase 1–3: shell, auth, shops
- Phase 4: grammY webhook, connect codes, `channels` table
- Next: Phase 5 core loop (post → product → link)

## Stack (MVP)

- **Next.js** — web + Mini App + API
- **@tma.js/sdk** — Mini App bridge
- **grammY** — bot (Phase 4)
- **Postgres + Drizzle** — data (Phase 3)

## Develop

```bash
cp .env.example .env.local
# edit SESSION_SECRET, TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

npm run db:up          # Postgres on localhost:5433
npm run db:push        # apply schema
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For Mini App testing, expose HTTPS (ngrok / cloudflared) and set the URL in @BotFather → `/newapp`.
Also set the Login Widget domain in @BotFather → Bot Settings → Domain.

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/auth/me
```

Auth smoke (optional, needs bot token + running server):

```bash
TELEGRAM_BOT_TOKEN=your:token npx tsx scripts/smoke-auth.ts
TELEGRAM_BOT_TOKEN=your:token npx tsx scripts/smoke-shops.ts
```

### Telegram bot webhook

Expose HTTPS (ngrok/cloudflared), then:

```bash
TELEGRAM_BOT_TOKEN=your:token \
TELEGRAM_WEBHOOK_SECRET=your-secret \
NEXT_PUBLIC_APP_URL=https://your-tunnel.example \
npx tsx scripts/set-webhook.ts
```

Connect flow: Dashboard → Connect channel → post `PFY-XXXX-XXXX` in the channel.

## Design note

Bots **cannot edit human channel posts**. MVP uses reply/follow-up links; post-via-bot for bot-owned editable posts. See [Architecture](docs/ARCHITECTURE.md).
