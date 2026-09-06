# Postify — Product Overview

Postify turns Telegram channels into ecommerce storefronts.

Sellers keep posting products in Telegram. Postify’s bot detects product posts, extracts structured product data (with an LLM), publishes them to a website / Telegram Mini App, and links buyers back from Telegram into a proper shop experience.

---

## Problem

Many shops already sell via Telegram channels:

- Photos + captions with price, sizes, “DM to order”
- No real catalog, cart, search, or shareable product pages
- Buyers bounce between DMs and payment apps
- Sellers don’t want to learn Shopify / a new CMS

## Solution

1. Seller adds the Postify bot to their channel (admin).
2. When a product is posted (or posted via the bot), Postify:
   - Detects it as a product listing
   - Parses title, price, currency, category, description, variants
   - Creates a product page on the storefront
   - Attaches an **Open in shop** link (Mini App and/or web)
3. Buyers browse and buy on the **same Next.js app** running as:
   - A normal website (SEO, share links, desktop)
   - A Telegram Mini App (in-Telegram WebView)

## Who it’s for

**Primary:** Channel-native merchants (fashion, electronics, local goods, resellers) who already post listings in Telegram.

**Secondary:** Buyers who discover products in channels and want a cleaner purchase flow.

## Core value props

| For sellers | For buyers |
|-------------|------------|
| Keep posting in Telegram | Tap “Open in shop” instead of DMing |
| Auto catalog from existing workflow | Clear price, photos, product page |
| One dashboard for stock / orders | Cart + checkout (phased) |
| Web storefront without rebuilding content | Works inside Telegram or in browser |

## Non-goals (MVP)

- Full Shopify replacement (complex shipping rules, multi-warehouse, etc.)
- Native iOS/Android apps
- Automatic editing of *human-authored* channel posts (Bot API limitation — see Architecture)
- Stars-only payments for physical goods

## Success metrics (early)

- Seller can connect a channel and publish first product in < 10 minutes
- ≥ 80% of product posts parse with usable title + price (after confirm flow)
- Buyer can open a product from Telegram and complete an order intent (DM or checkout)
- Same product URL works in Mini App and browser
