# Architecture

## Shape

```
Telegram ──webhook──▶ ┌───────────────────────────┐      ┌──────────────┐
Buyers/sellers ─edge─▶│ goods (Cloud Run, public) │─SQL─▶│ Neon Postgres │
  (CF Worker router)  │ Next.js: pages, API, bot  │      └──────────────┘
                      └────────────┬──────────────┘             ▲
                          enqueue  │ Cloud Tasks (OIDC)          │
                                   ▼                             │
                      ┌───────────────────────────┐              │
Cloud Scheduler ─────▶│ goods-jobs (Cloud Run,     │──────────────┘
  sweep 5 min,nightly │ IAM-only): same image      │──▶ R2 (images) · Gemini · Telegram API
                      └───────────────────────────┘
```

There is one image and one codebase. `goods` serves people and Telegram. `goods-jobs` runs background work behind IAM, so heavy work (images, AI, Telegram edits) never competes with page loads. Both scale to zero.

## Telegram integration (the differentiator)

**Connect.** `/start` shows a keyboard with "Connect a channel" and "Connect a group". These use Telegram's native chat picker (`KeyboardButtonRequestChat`). The picker shows only chats where the seller is an admin, and it asks Telegram to add the bot with exactly the rights we need: *post* and *edit* for channels, plus *pin* for groups. The `chat_shared` update links the chat in one step. `my_chat_member` keeps rights in sync, and the seller is warned in DM if rights are removed.

**Ingest.** The webhook does only cheap work: it verifies the secret, filters to connected chats, and stores the raw update (`telegram_updates`, keyed by `update_id`, so it is idempotent). It then enqueues `ingest`. Album parts share a task name derived from `media_group_id` and a 3 s delay, so a 10-photo album becomes one product. Parts that arrive late are appended.

`processIngest` claims the rows, extracts the listing (AI with guardrails, or the rule-based parser), creates or updates the product, queues the images, and requests a button sync. Edits re-extract, with at most 3 extractions per post per day. A "SOLD" or "ተሽጧል" caption marks the product sold. In groups, only posts by admins are ingested.

**Buttons — a desired-state reconciler** (`domain/buttons.ts`):

- Each product source has a `desiredHash` (label language, availability, price state) and an `appliedHash`. `syncButtons` locks the row (`FOR UPDATE`), renders the keyboard and applies it.
- Telegram errors are classified. *Not modified* counts as success. *Message deleted* archives the product, unless it is also posted elsewhere. *No rights* warns the seller once. *429* reschedules after `retry_after`.
- **Mode fallback:** a channel post gets the buttons edited directly onto it (`inline`). Albums and posts the bot can't edit get a small reply card under the post (`reply_card`). Products created from the dashboard can be posted by the bot (`bot_post`).
- Buttons are URL buttons to `t.me/<bot>/<app>?startapp=p_<code>`, because `web_app` buttons only work in private chats. They open the Mini App straight to the product with ordering ready. On the web, `/go/<param>` resolves the same codes.
- The 5-minute sweep re-drives any sync whose request hasn't landed, so a crash or outage converges on the next run.

## Commerce

- Money is stored as `bigint` santim. IDs are UUIDv7. Product codes are base62.
- **Checkout** is pay-on-delivery. "Pay online" is shown disabled ("Coming soon") and logs interest. `placeOrder` runs in one transaction:
  - It validates the phone, address and fulfilment, rate-limits each buyer (5 per hour) and honours blocked buyers.
  - It reserves stock with a conditional decrement, so two buyers can't buy the last item.
  - It takes an atomic per-shop order number (from 1001), upserts the customer, writes the lines and the payment, and clears the cart.
- **Lifecycle** is placed → confirmed → shipped → delivered → completed (or cancelled, which restocks).
  - "Payment received", or completing a pay-on-delivery order, records the cash.
  - A delivered one-off item becomes *sold*.
  - Sellers get reminders about unconfirmed orders at 2 h and 24 h; the order is auto-cancelled at 72 h.
- **Roles** are owner, admin and staff. Every API route goes through `authorize(handle, action)`. A non-member gets a 404, and a member with too low a role gets a 403.

## AI cost guardrails (`domain/ai-guard.ts`)

These checks run in order:

1. **Cache:** identical captions are never paid for twice.
2. **Per-shop daily quota:** 100 calls, or 20 for shops younger than 7 days.
3. **Platform daily budget breaker:** sends an ops alert when tripped.
4. **The call itself:** Gemini Flash with structured JSON output, thinking disabled, `maxOutputTokens` of 1024, the caption capped at 2,000 characters and a 20 s timeout. It retries once.
5. **Fallback:** the rule-based parser.

Hitting a limit never blocks a product: it degrades to the parser and flags the product for review.

## Storefront and tenancy

`src/proxy.ts` maps `<handle>.goods.et` and custom domains (`__host__<domain>`) to `/s/<shop>/…`. The edge Worker forwards the original host in `X-Forwarded-Host`.

Pages are server-rendered and locale-aware (English or Amharic, via cookie or shop default). Hashed assets are cached at the edge for a year. Images are WebP renditions at 320, 800 and 1600 px, made by sharp and served from R2 behind `img.goods.et`.

## Background work

| Queue | Job | Notes |
|---|---|---|
| ingest | `processIngest(groupKey)` | album-coalesced via task names |
| media | `processImage(imageId)` | Telegram file → R2 original → renditions |
| buttons | `syncButtons(sourceId)` | rate-limited queue, rights-aware |
| notify | seller/buyer DMs | `sendOnce` ledger avoids duplicates |

Locally and in tests, `TASKS_MODE=inline` runs the same handlers in-process. The `/internal/*` endpoints accept only Google-signed OIDC tokens for the invoker service account, and the edge Worker refuses `/internal/*`.

## Data

The full schema is in `src/server/db/schema.ts`. Migrations are generated into `drizzle/`, and CI fails if the two drift. The main groups:

- **Tenancy:** `shops` (settings JSON), `shop_members`, `shop_invites`, `shop_domains`.
- **Telegram:** `channels`, `telegram_updates`, `product_sources` (button state).
- **Catalog:** `products`, `product_variants`, `product_images`, `collections`.
- **Commerce:** `carts`, `orders`, `order_lines`, `payments`, `customers`.
- **Messaging:** `conversations`, `messages`, `telegram_deliveries`, `bot_contexts`, `notification_log`.
- **Analytics and AI:** `events`, `shop_daily_stats`, `ai_usage`, `ai_cache`.

## Known limits / next

- Storefront HTML isn't edge-cached yet. Pages read the locale cookie; the next step is a locale-in-path variant that can be cached.
- The dashboard UI is English-only; buyer-facing pages and bot messages are bilingual. Amharic strings need a native-speaker pass.
- Custom domains are modelled and routed, but onboarding (Cloudflare for SaaS hostname provisioning) is "coming soon" in the UI.
- Online payments (Telebirr, Chapa) plug into `payments`; the checkout UI and order state already account for them.
- Validate against real Telegram before launch: album reply cards and edit behaviour in large channels.
