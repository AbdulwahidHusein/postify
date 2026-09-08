# Postify Chat + Telegram Bridge — Design

**Status:** Implemented (v1) — hub + bot bridge, focused polling, seller/buyer inboxes.  
**Goal:** Product-scoped buyer↔seller messaging that feels native to Telegram, with a clean seller inbox and realtime delivery.

---

## 1. Problem

Today buyers only get `tel:` / channel links. That loses product context, creates no seller inbox, and cannot close the loop when the seller replies.

The killer loop:

1. Buyer opens a product → sends a message  
2. Seller is notified on Telegram with product details  
3. Seller replies (from bot or Postify inbox)  
4. Buyer gets the reply in-app **and** on Telegram  
5. Seller manages many inquiries without chaos  

---

## 2. Architecture decision (locked)

### Chosen: **Postify Conversation Hub + Telegram Bot Bridge**

Postify owns the conversation (Postgres). Telegram is a **push + quick-reply transport**, not the source of truth.

```text
Buyer (Web / Mini App)
        │
        ▼
   Postify API  ──write──►  Postgres (conversations, messages)
        │                         │
        │                         ├── realtime fan-out to open UIs
        ▼                         ▼
   Telegram Bot  ──────────►  Seller DM (notify + reply-to)
        │
        ▼
   Telegram Bot  ──────────►  Buyer DM (seller replied)
```

### Why not “just open Telegram chat with the seller”?

Bots **cannot** create a private human↔human chat that keeps Postify product context and a unified inbox.

### Why not Telegram Business first?

Telegram Business can place chats in the seller’s personal inbox (native feel) but requires Business setup, extra connection UX, and weaker Postify control. **Design the schema so a Business adapter can plug in later.** Do not block v1 on it.

### What “integrate with Telegram chat” means in v1

- Seller works in **bot DMs** (reply to the notification) **or** Postify Inbox  
- Buyer works in **Postify thread** + gets **bot DMs** for replies  
- Deep links jump straight into the right thread in the Mini App / web  

That is the honest, scalable Telegram integration for a marketplace bot.

---

## 3. Product rules

| Topic | Rule |
|--------|------|
| Thread grain | **One conversation per `(shop, product, buyer)`** |
| Start chat | Buyer must be **signed in with Telegram** |
| Guests | CTA: “Sign in with Telegram to message” |
| Sold items | Existing threads stay open; new messages allowed with clear “This item is marked sold” system note |
| Media | **Text only in v1** (photos later) |
| Rate limit | Soft cap (e.g. 20 msgs / buyer / shop / hour) |
| Close | Seller can **Close**; buyer message reopens |
| Source of truth | **Postgres first**, then notify Telegram async |
| Channel ingest | Untouched — chat handlers only on private bot chats |

---

## 4. Data model

### `conversations`
- `id`, `shop_id`, `product_id`, `buyer_user_id`
- `status`: `open` | `closed`
- `last_message_at`, `last_message_preview`
- `seller_unread_count`, `buyer_unread_count`
- Unique: `(shop_id, product_id, buyer_user_id)`

### `messages`
- `id`, `conversation_id`
- `sender_role`: `buyer` | `seller` | `system`
- `sender_user_id` (nullable for system)
- `body` (text, length-capped)
- `client_id` (nullable, unique per conversation) — idempotent UI sends
- `created_at`

### `message_deliveries`
Maps Postify messages ↔ Telegram messages for **reply-to** routing:

- `message_id` (FK)
- `channel`: `telegram_seller` | `telegram_buyer`
- `telegram_chat_id`, `telegram_message_id`
- Unique: `(telegram_chat_id, telegram_message_id)`

### `notification_outbox` (recommended from day one)
- `id`, `kind`, `payload` JSON, `status`, `attempts`, `next_attempt_at`
- Keeps `/api/bot` and message POST handlers fast under Telegram rate limits

Seller user is always resolved via `shops.owner_user_id → users.telegram_id`.  
Buyer push uses `users.telegram_id` from the session user.

---

## 5. UX

### Buyer
1. PDP primary CTA: **Message seller** (Call stays secondary if phone exists).  
2. Thread view with **sticky product header** (thumb, title, price, Sold badge).  
3. Buyer inbox: `/inbox` — all their threads across shops.  
4. Soft prompts for first message: availability / size / hold.

### Seller (manage without mess)
1. **One Inbox**, not a separate app per product:  
   `/dashboard/s/{slug}/inbox`
2. Rows: product thumb · buyer · preview · time · unread  
3. Filters: **Unread · All · Product**  
4. Thread: sticky product card + composer; **Close**, **View product**, **Mark sold**  
5. Product edit: single **Messages (n)** link → inbox filtered to that product  

**Avoid:** duplicate “Dashboard / Messages / Chat” chrome; one Inbox entry in shop nav with an unread badge.

### Telegram message design

**To seller:**
```text
New message · {Shop name}
{Product title} · {price}
From {Buyer} {@username}

“{buyer message}”

[Open in Postify]   [Reply]
```

**To buyer (on seller reply):**
```text
Reply from {Shop} · {Product}

“{seller message}”

[Open chat]
```

If the user never `/start`ed the bot, mark delivery failed and show a one-time in-app hint: open the bot for Telegram alerts.

---

## 6. Realtime (practical for current stack)

No Pusher/Ably/WebSocket in the repo today; serverless hosts dislike long sockets.

**v1 (reliable):**
- Save message in DB  
- Open thread: **focused short-polling** (~1.5–2s) while the tab is visible  
- Optimistic send + reconcile via `client_id`  
- **Telegram push** covers the case when the app is closed  

**Later:** swap fan-out to Ably/Pusher/Supabase Realtime or CF Durable Objects — **same DB events, different adapter**.

Invariant: Telegram delivery failure never rolls back a saved message.

---

## 7. Bot reply mapping (must be correct)

1. Outbound seller notify stores `message_deliveries` for the Telegram `message_id`.  
2. Inbound private message to the bot:  
   - If `reply_to_message` → lookup delivery → conversation → insert **seller** message → notify buyer  
   - Else if callback “Reply” set `pending_reply_conversation_id` for that seller → next text binds to it  
   - Else → short help: “Reply to a product notification, or open Inbox.”  
3. Separate private-message handlers from channel ingest (do not mix).  
4. Deep link: `t.me/{bot}?start=c_{shortId}` → Mini App / web inbox thread.

---

## 8. API (lean)

| Endpoint | Who | Purpose |
|----------|-----|---------|
| `POST /api/products/:id/conversations` | Buyer | Get-or-create thread |
| `GET /api/inbox` | Buyer | List buyer threads |
| `GET /api/shops/:slug/inbox` | Owner | List seller threads (+ filters) |
| `GET /api/conversations/:id` | Buyer or owner | Thread + product summary |
| `GET /api/conversations/:id/messages?after=` | Buyer or owner | Cursor page |
| `POST /api/conversations/:id/messages` | Buyer or owner | Send `{ body, clientId }` |
| `POST /api/conversations/:id/close` | Owner | Close thread |

Authz on every call: shop owner **or** conversation buyer only.

---

## 9. Build phases (implementation order later)

| Phase | Scope | Ships |
|-------|--------|--------|
| **C0** | Schema + services + authz APIs + outbox table | Backend truth |
| **C1** | PDP Message CTA + thread UI + buyer `/inbox` | Buyers inquire |
| **C2** | Seller inbox + unread badge + product Messages link | Sellers manage |
| **C3** | Bot notify + reply-to + buyer notify | Telegram loop |
| **C4** | Retries, rate limits, closed/sold copy, delivery failures UX | Hardened |
| **Later** | Photos, reply templates, Telegram Business adapter, true WS provider | Love extras |

**Do not ship C3 before C1/C2.** Bot-only chat without an inbox becomes unmanageable DMs.

---

## 10. Explicit non-goals (v1)

- Cart / checkout / payments inside chat  
- Pretending the bot opens a personal seller↔buyer Telegram chat  
- Separate inbox app per product  
- Anonymous messaging  
- Using the shop channel as the chat transport  

---

## 11. Success criteria

- Buyer on PDP → sign-in → message → visible in thread immediately  
- Seller Telegram DM includes product + message within seconds  
- Seller reply-to in Telegram appears in buyer thread + buyer Telegram  
- Inbox usable with 50+ open inquiries (unread sort + product filter)  
- Channel ingest and post-to-channel remain unchanged  

---

## 12. Code touchpoints (when building)

- Auth / `telegramId`: `src/lib/auth/session.ts`, `src/lib/auth/users.ts`  
- Ownership: `src/lib/shops.ts`, `src/lib/viewer.ts`  
- Bot webhook: `src/bot/index.ts`, `src/app/api/bot/route.ts`  
- Replace weak channel “Message seller” on: `src/app/p/[slug]/page.tsx`  
- Schema: `src/db/schema.ts`
