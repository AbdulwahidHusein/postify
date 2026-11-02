# Goods

**Shopify for Ethiopia, Telegram-first.** A seller connects their Telegram channel or group in two taps. Every product they post becomes a product in a real online shop, with **Order** and **Ask** buttons added to the Telegram post. Buyers order with pay-on-delivery. Sellers run everything from a lean dashboard that works inside Telegram or in a browser. Free for merchants.

- **Telegram**: add the bot → post as usual → the products appear in the shop and buttons appear on the posts. Edits sync, "SOLD" captions mark items sold, and deleted posts archive the product.
- **Storefront**: `<shop>.goods.et`, in English and Amharic. It has collections, search, cart, checkout, order tracking and buyer↔seller chat. It also runs as a Telegram Mini App.
- **Dashboard**: orders, products (bulk edit, images, variants, inventory), customers, inbox, analytics, Telegram channel health, store design, staff roles and settings.
- **AI**: Gemini extracts title, price, category and attributes from Amharic and English captions. It is cost-capped: cache, per-shop quotas, a platform-wide daily budget breaker and a free rule-based fallback.

## Stack

One TypeScript codebase: Next.js 16 (App Router), Drizzle + Postgres (Neon) and grammY. It runs on Cloud Run with Cloud Tasks + Scheduler, Cloudflare R2 for images and a Cloudflare Worker at the edge. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run locally

```bash
npm install
cp .env.example .env.local        # defaults work for a first run
npm run db:up                     # Postgres in Docker (or point DATABASE_URL at Neon)
npm run db:migrate
npm run db:seed                   # demo shop + prints a dev session cookie
npm run dev                       # http://localhost:3000/s/demo
```

To open the dashboard without Telegram, set the printed `goods_session` cookie in devtools and visit `/dashboard/demo`.

**With a real bot:** create a dev bot in @BotFather and expose port 3000 with a tunnel (`cloudflared tunnel --url http://localhost:3000`). Set `TELEGRAM_*` and `NEXT_PUBLIC_APP_URL` to the tunnel URL, then run `npm run telegram:webhook`. Open the bot, tap **Connect a channel**, and post a photo with a price.

Background jobs run in-process in dev (`TASKS_MODE=inline`). Images are stored under `.data/` unless R2 is configured. AI falls back to the rule-based parser when no Gemini key is set.

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

The tests run against an in-memory Postgres (PGlite) with a fake Telegram API. They need no services and cover ingest, albums, edits, the button engine's failure modes, checkout and inventory, the order lifecycle, tenant isolation, AI guardrails and the webhook.

## Deploy

[docs/DEPLOY.md](docs/DEPLOY.md): one-time GCP/Cloudflare/Neon setup, then `./infra/deploy.sh`, or push to `main` with the GitHub workflow.

## Layout

```
src/app/            routes: storefront (/s/[shop]), dashboard, API, webhook, /internal (jobs)
src/server/domain/  business logic: ingest, buttons, orders, cart, channels, ai-guard, …
src/server/services storage (R2), tasks (Cloud Tasks), telegram, llm, images, oidc
src/server/bot/     grammY bot + webhook entry
src/components/     dashboard, store, chat, ui
drizzle/            SQL migrations (generated from src/server/db/schema.ts)
infra/              setup/deploy scripts, Cloud Build, scheduler, edge Worker
test/               Vitest suites (PGlite + fake Telegram)
```
