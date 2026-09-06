# Postify — Phased End-to-End Plan

Build order is intentional: prove Telegram ↔ product page loop before cart, payments, and polish.

---

## Phase 0 — Foundations (docs + repo)

**Goal:** Shared understanding and empty-but-ready project.

### Deliverables
- [x] `docs/PRODUCT.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/TECH_STACK.md`
- [x] `docs/PHASED_PLAN.md` (this file)
- [x] Repo scaffold decision recorded in README
- [ ] Bot created in @BotFather (dev bot)
- [ ] Mini App registered (`/newapp`) with placeholder HTTPS URL

### Exit criteria
- Team agrees on bot-owned-post vs reply-link strategy for MVP
- Dev bot + Mini App short name exist

---

## Phase 1 — App skeleton (Next.js + dual shell)

**Goal:** One Next.js app that runs as website and as Mini App shell.

### Work
1. [x] Scaffold Next.js (App Router) + TypeScript + Tailwind
2. [x] Basic routes: `/`, `/p/[slug]`, `/dashboard`
3. [x] `TelegramProvider` (client): init `@tma.js/sdk` v3, theme CSS vars, `ready()`
4. [x] Mode detection: Mini App vs browser
5. [x] Health check API route
6. [x] Env template (`.env.example`)
7. [x] README: run locally + expose HTTPS for Telegram

### Exit criteria
- [ ] Mini App opens inside Telegram and shows “Hello, {first_name}” (needs BotFather + HTTPS tunnel)
- [x] Same deploy opens in browser without crashing
- [x] Theme CSS vars wired for Telegram `bindCssVars`

---

## Phase 2 — Auth (web + Mini App → one session)

**Goal:** Trusted identity for sellers and buyers.

### Work
1. [x] Server util: validate Mini App `initData` via `@tma.js/init-data-node`
2. [x] API: `POST /api/auth/telegram-miniapp` → session
3. [x] Telegram Login Widget on web → `POST /api/auth/telegram-widget` → same session
4. [x] `users` table (`telegram_id`, name, username, photo)
5. [x] Helpers: `getSession` / `requireSession` + `/api/auth/me`
6. [x] Logout + session expiry (14-day JWT cookie)

### Exit criteria
- [x] User can sign in from Mini App (auto via initData) and from website (Login Widget)
- [x] Both map to the same `users` row (upsert by `telegram_id`)
- [x] Privileged payloads rejected when signature/expiry invalid
- [ ] Real BotFather domain + token configured in your environment

---

## Phase 3 — Data model + seller shop

**Goal:** A seller has a shop that can later connect to a channel.

### Schema (initial)
- [x] `users`
- [x] `shops` (owner_user_id, name, slug, settings JSON)
- [ ] `channels` (Phase 4)
- [ ] `products` / `product_images` / `parse_jobs` (Phase 5)
- [ ] `orders` (Phase 7)

### Work
1. [x] Drizzle + Postgres migrations (`npm run db:up` / `db:push`)
2. [x] Dashboard: create shop, list shops
3. [x] Public shop page `/s/[shopSlug]`

### Exit criteria
- [x] Authenticated user can create a shop
- [x] Shop appears at public URL `/s/[slug]`
- [ ] Real Telegram Login Widget domain configured (env-dependent)

---

## Phase 4 — Bot webhook + channel connect

**Goal:** Bot is alive; seller can attach a channel.

### Work
1. [x] grammY bot instance + `POST /api/bot` webhook
2. [x] Commands: `/start`, `/help`, `/status`
3. [x] Detect bot added to channel / `my_chat_member` (logged)
4. [x] Store `channels` row linked to shop via connect code (`PFY-XXXX-XXXX`)
5. [x] Webhook secret token + `scripts/set-webhook.ts`
6. [x] Logging + `bot.catch`

### Channel posting strategy for MVP (decision)
**Default MVP:** **Reply / follow-up link** on human channel posts  
**Plus:** **Post-via-bot** flow so we can demo bot-owned edits later

### Exit criteria
- [x] Bot receives `channel_post` updates for connected channel (touches `lastPostAt`; Phase 5 enqueues parse)
- [x] Dashboard shows channel as connected + connect-code flow
- [ ] Real BotFather webhook URL pointed at your HTTPS tunnel / deploy

---

## Phase 5 — Ingest → product page → Telegram link (the core loop)

**Goal:** End-to-end magic: post in Telegram → product on site → open from Telegram.

### Work
1. On `channel_post` with photo/caption (or text): enqueue `parse_jobs`
2. Media group coalescing by `media_group_id`
3. Download images → R2/S3 → `product_images`
4. LLM structured extract → product draft/published
5. Create `/p/[slug]` with real data
6. Telegram side:
   - If bot-owned message: `editMessageCaption` / `editMessageReplyMarkup` with Mini App button + web URL
   - If human message: reply with InlineKeyboard: **Open in Mini App** (`web_app` or `url` to `t.me/bot/app?startapp=...`) and **Open on web**
7. `startapp` resolves to product in Mini App
8. Seller setting: auto-publish vs always-draft

### Exit criteria
- Post a product photo+caption in connected channel
- Product appears on website within ~30–60s
- Button/link opens the correct product in Mini App and browser

**This is the first “wow” milestone. Do not start cart before this works reliably.**

---

## Phase 6 — Parse quality + seller control

**Goal:** Make LLM parsing trustworthy enough for daily use.

### Work
1. Confidence thresholds + draft queue in dashboard
2. Inline confirm/edit in Mini App or dashboard (title, price, category)
3. Per-shop few-shot examples / preferred categories
4. Non-product filter (announcements, giveaways, memes)
5. Re-parse / manual create product
6. Basic observability: parse success rate, latency, cost per post

### Exit criteria
- Seller can fix a bad parse in < 30 seconds
- Auto-publish only when confidence ≥ shop threshold
- Clear metrics for parse quality

---

## Phase 7 — Commerce basics (orders)

**Goal:** Convert interest into an order (even if payment is manual at first).

### MVP commerce options (pick one first)
**A. Order intent:** Buy → creates order → notifies seller via bot (cash/transfer offline)  
**B. Stripe Checkout:** Pay online for physical goods  

Recommend **A then B**.

### Work
1. Cart (session or user-scoped)
2. Checkout form (name, phone, address/notes)
3. `orders` + `order_items`
4. Notify seller in Telegram
5. Order statuses: `new` → `confirmed` → `fulfilled` / `cancelled`
6. Dashboard order list

### Exit criteria
- Buyer can place an order from Mini App and website
- Seller receives Telegram notification with order details

---

## Phase 8 — Payments (optional stretch)

**Goal:** Online payment for physical goods.

### Work
1. Stripe Checkout or Payment Intents
2. Webhooks → mark order paid
3. Do **not** force Stars for physical goods
4. (Later) Stars only if selling digital goods inside Telegram

### Exit criteria
- Paid order path works in browser; Mini App opens external/payment flow cleanly

---

## Phase 9 — Hardening & launch prep

**Goal:** Production readiness for first real sellers.

### Work
1. Rate limits, abuse controls, shop isolation tests
2. Image optimization / CDN
3. SEO for public product pages
4. Error monitoring (Sentry), bot uptime alerts
5. Seller onboarding checklist in-product
6. Privacy policy / ToS (LLM processing disclosure)
7. Load test webhook + job queue
8. Backup / migrate runbook

### Exit criteria
- One pilot seller runs for a week without manual engineering intervention
- Documented ops runbook exists

---

## Phase map (visual)

```
0 Docs
  → 1 Skeleton (web + TMA shell)
    → 2 Auth
      → 3 Shop + DB
        → 4 Bot + channel connect
          → 5 ★ Core loop: post → product → link
            → 6 Parse quality
              → 7 Orders
                → 8 Payments
                  → 9 Harden / pilot launch
```

---

## Milestone checklist (executive)

| Milestone | Phase | Definition of done |
|-----------|-------|--------------------|
| Dual shell live | 1 | Mini App + website same deploy |
| Identity works | 2 | One user, two entry points |
| Shop exists | 3 | Public shop URL |
| Channel wired | 4 | Bot sees channel posts |
| **Core loop** | **5** | **Post → product → open in shop** |
| Trustworthy catalog | 6 | Confirm/edit + confidence |
| Sell something | 7 | Order created + seller notified |
| Take money | 8 | Online payment (optional) |
| Pilot ready | 9 | Stable for real sellers |

---

## Open decisions (resolve before/during Phase 4–5)

1. **MVP link strategy:** reply-only vs post-via-bot first?  
   **Recommendation:** reply-only for human posts + simple post-via-bot for demos.
2. **Domain / branding:** `postify.app` or other?
3. **Default currency / locale** for first market?
4. **Job runner:** Inngest vs DB poller for Phase 5?
5. **Pilot niche:** which vertical first (fashion, electronics, food)?

---

## What we build next

After this documentation is accepted:

1. Phase 1 scaffold in the empty repo  
2. Phase 2 auth  
3. Push to Phase 5 as fast as possible (core loop)
