# Postify — Tech Stack

Decisions locked for MVP unless a phase explicitly revisits them.

## Core

| Area | Choice | Notes |
|------|--------|-------|
| Runtime | Node.js 20 or 22 LTS | |
| Framework | **Next.js (App Router) + TypeScript** | Front + API in one app |
| UI | Tailwind CSS + shadcn/ui | Shared design system for web + TMA |
| Bot | **grammY** | TS-first; `std/http` adapter for App Router |
| Mini App SDK | **`@tma.js/sdk` + `@tma.js/sdk-react` (^3)** | Current package family (`@telegram-apps/*` is deprecated) |
| initData | **`@tma.js/init-data-node`** (Phase 2) | Server-side validate/parse |
| ORM / DB | **Drizzle + Postgres** | |
| Storage | **R2 or S3** | Persistent product images |
| LLM | OpenAI-compatible API + **structured JSON schema** | Swap provider later |
| Jobs | Start simple (DB job table + poller / Inngest); scale later | Must not run in webhook |

## Auth & sessions

- Mini App: validate `initData` → create httpOnly session cookie / JWT
- Web: Telegram Login Widget → same session format
- Library options: iron-session / jose / Auth.js custom providers — pick during Phase 1 scaffold

## Hosting (MVP)

- **Vercel** for Next.js
- Webhook: `POST /api/bot` with grammY `webhookCallback(bot, 'std/http')`
- Offload long work; watch serverless timeouts

## Explicitly out of scope for stack MVP

- Separate Vite Mini App
- Telegraf
- Microservices
- React Native
- Kafka / heavy event bus

## Package starter set

```bash
# framework
next react react-dom typescript

# ui
tailwindcss

# telegram
@tma.js/sdk @tma.js/sdk-react
@tma.js/init-data-node   # Phase 2
grammy                   # Phase 4

# data
drizzle-orm drizzle-kit postgres

# validation / utils
zod
```

## Environment variables (planned)

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_MINI_APP_SHORT_NAME=shop
NEXT_PUBLIC_APP_URL=
DATABASE_URL=
S3_ENDPOINT=          # or R2
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
LLM_API_KEY=
LLM_BASE_URL=         # optional
SESSION_SECRET=
```

## References

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Bot API](https://core.telegram.org/bots/api)
- [tma.js docs](https://docs.telegram-mini-apps.com/)
- [grammY](https://grammy.dev/)
- [Stars payments (digital only)](https://core.telegram.org/bots/payments-stars)
