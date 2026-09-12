# Goods — Architecture

## High-level system

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Ecosystem                        │
│  Channel posts  →  Bot (grammY)  →  edits/replies w/ link   │
│  Buyer taps link →  Mini App WebView OR external browser     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js (App Router) — single app                │
│  (store) public SEO storefront                                │
│  (tma)   same pages, Telegram chrome when in Mini App         │
│  dashboard  seller onboarding, products, orders               │
│  api/bot    grammY webhook                                    │
│  api/auth   initData + Login Widget → session                 │
│  api/*      products, shops, orders, jobs                     │
└───────────────┬──────────────────────────┬──────────────────┘
                │                          │
                ▼                          ▼
         Postgres (Drizzle)          Object storage (R2/S3)
         shops, products,            product images from TG
         channels, orders,
         parse jobs
                │
                ▼
         Job worker / queue
         (media group coalesce + LLM structured extract)
```

## Dual surface: one app, two shells

| Surface | Entry | Auth | UI chrome |
|---------|-------|------|-----------|
| **Website** | `https://goods.et/...` | Telegram Login Widget → session | Normal header/nav, SEO |
| **Mini App** | `https://t.me/<bot>/<app>?startapp=...` | `initData` HMAC → same session | Telegram theme, MainButton, safe areas |

**Rule:** Detect Mini App via presence of validated `initData`. Never trust `initDataUnsafe` for privileged actions.

Shared: product pages, catalog, cart, checkout APIs, seller dashboard data.

## Critical Telegram constraints

### 1. Bots cannot edit human posts

The Bot API only allows editing messages **sent by the bot itself**.

Therefore Goods must **not** depend on "seller posts → bot edits that exact message."

**Supported patterns (in priority order):**

1. **Bot-owned posts (preferred)**  
   Seller sends product to bot / uses a posting flow; bot publishes to the channel; bot can later edit caption and attach buttons.

2. **Reply / follow-up message**  
   Human posts in channel; bot detects `channel_post`; creates product; replies or posts a short follow-up with **Open in shop**.

3. **Delete + repost (opt-in, aggressive)**  
   Only if seller explicitly enables; bot deletes original and republishes as itself.

### 2. Media groups

Multi-photo listings arrive as multiple updates sharing `media_group_id`.  
Coalesce before LLM parse and product creation (debounce ~1–2s).

### 3. Telegram file URLs expire

Always download media via Bot API (`getFile`) and store in R2/S3. Persist our own URLs.

### 4. Deep links (`startapp`)

Format: `https://t.me/<bot>/<short_name>?startapp=<param>`

- Allowed chars: `A-Z a-z 0-9 _ -`
- Max length: 512
- Use short opaque IDs (e.g. `p_x7k2`) mapped in DB — not raw titles

Also expose public web URLs: `https://goods.et/p/<slug>` for sharing outside Telegram.

### 5. Payments

- **Physical goods:** Stripe / local PSP (not forced to Stars)
- **Digital goods inside Telegram:** Stars (`XTR`) only
- MVP: order capture (and optionally payment later)

## Bot responsibilities

- Onboarding: `/start`, link shop, add-to-channel instructions
- Ingest: `channel_post` / `edited_channel_post` (and private “post via bot” flow)
- Enqueue parse jobs; never block webhook on LLM
- Attach Mini App / URL buttons when message is bot-owned
- Seller confirmations for low-confidence parses (inline buttons / Mini App)

## Backend responsibilities (Next.js API)

- Validate Telegram auth (initData + Login Widget)
- CRUD shops, channels, products, orders
- Trigger / process parse jobs
- Serve storefront data (SSR for SEO where useful)
- Webhook endpoint for grammY (`webhookCallback(bot, 'std/http')`)

## LLM parsing pipeline

**Input:** caption text + optional OCR later + shop locale defaults  

**Output (JSON schema):**

```json
{
  "is_product": true,
  "confidence": 0.0,
  "title": "",
  "description": "",
  "price": null,
  "currency": null,
  "category": null,
  "tags": [],
  "variants": [],
  "condition": null
}
```

**Rules:**

- Cheap filters first (has media? looks like price? announcement keywords?)
- LLM only when likely a product
- Low confidence → draft + seller confirm; high confidence → auto-publish (per shop setting)
- Never invent prices; omit or flag missing price

## Auth model

```
Telegram identity (telegram_user_id)
        ↓
Internal user row
        ↓
Session / JWT used by web + Mini App APIs
```

| Entry | Verification |
|-------|----------------|
| Mini App | HMAC-SHA256 of raw `initData` with bot token (`WebAppData`); check `auth_date` freshness |
| Website | Telegram Login Widget hash verification (different algorithm) |

Both resolve to the same `users.telegram_id`.

## Security checklist

- [ ] Never expose bot token to client
- [ ] Validate initData / login widget on every privileged API call (or session derived from it)
- [ ] Webhook secret token (`secret_token` on `setWebhook`)
- [ ] Expire initData (~24h max age)
- [ ] Rate-limit parse jobs and auth endpoints
- [ ] Shop isolation: sellers only access their shop’s products/orders
- [ ] ToS note: channel content sent to LLM provider

## Deployment shape

| Piece | Recommendation |
|-------|----------------|
| Next.js app | Vercel (or similar) |
| Bot webhook | Same app `/api/bot` — keep handlers thin |
| Heavy jobs | Queue + worker (Inngest / Trigger.dev / BullMQ) or separate Node process |
| DB | Managed Postgres |
| Files | Cloudflare R2 or S3 |

**Rule:** Webhook must ACK quickly. LLM + media download happen off the request path.
