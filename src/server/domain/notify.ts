import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { InlineKeyboardButton } from "grammy/types";
import { db } from "@/server/db";
import {
  botContexts,
  channels,
  conversations,
  messages,
  notificationLog,
  orders,
  productSources,
  products,
  shopMembers,
  shops,
  telegramDeliveries,
  users,
  type Shop,
} from "@/server/db/schema";
import { appUrl, serverEnv } from "@/server/env";
import { log } from "@/server/log";
import {
  channelRightsLink,
  classifyTelegramError,
  escapeHtml,
  groupRightsLink,
  postLink,
  RetryLater,
  tg,
} from "@/server/services/telegram";
import { normalizeSettings } from "@/server/domain/shops";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { asLocale, tc, type Locale } from "@/i18n/catalog";

type Button = InlineKeyboardButton;

function shopLocale(shop: Pick<Shop, "locale">): Locale {
  return asLocale(shop.locale);
}

/** Private-chat button that opens a page in the Mini App (web_app needs https). */
function openButton(text: string, path: string): Button {
  const url = `${appUrl()}${path}`;
  return url.startsWith("https://") ? { text, web_app: { url } } : { text, url };
}

async function sellerRecipients(shopId: string) {
  return db
    .select({ telegramId: users.telegramId, userId: users.id })
    .from(shopMembers)
    .innerJoin(users, eq(users.id, shopMembers.userId))
    .where(and(eq(shopMembers.shopId, shopId), inArray(shopMembers.role, ["owner", "admin"])));
}

/**
 * Send once per key. Checks the ledger, sends, records. A crash between send
 * and record can at worst repeat one message, never lose it.
 */
async function sendOnce(
  key: string,
  chatId: bigint | number,
  text: string,
  keyboard?: Button[][],
  delivery?: { kind: string; refId: string },
): Promise<number | null> {
  const seen = await db.query.notificationLog.findFirst({ where: eq(notificationLog.key, key) });
  if (seen) return seen.telegramMessageId;
  try {
    const sent = await tg().sendMessage(Number(chatId), text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
    await db.insert(notificationLog).values({ key, telegramMessageId: sent.message_id }).onConflictDoNothing();
    if (delivery) {
      await db
        .insert(telegramDeliveries)
        .values({
          telegramChatId: BigInt(chatId),
          telegramMessageId: sent.message_id,
          kind: delivery.kind,
          refId: delivery.refId,
        })
        .onConflictDoNothing();
    }
    return sent.message_id;
  } catch (err) {
    const c = classifyTelegramError(err);
    if (c.kind === "rate_limited") throw new RetryLater(c.description, c.retryAfter ?? 5);
    if (c.kind === "transient") throw new RetryLater(c.description, 10);
    // Blocked bot, deleted account, bad request: retrying will not help.
    log.warn("notification not delivered", { key, kind: c.kind, description: c.description });
    await db.insert(notificationLog).values({ key, telegramMessageId: null }).onConflictDoNothing();
    return null;
  }
}

function priceText(minor: bigint | null | undefined, currency: string) {
  return minor === null || minor === undefined ? "no price yet" : formatMoney(minor, currency);
}

// ── listing receipts ────────────────────────────────────────────────────────
export async function notifyListingReceipt(productId: string, reason: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { variants: true, shop: true },
  });
  if (!product) return;
  const shop = product.shop;
  const locale = shopLocale(shop);
  const v = product.variants[0];
  const title = `<b>${escapeHtml(product.title)}</b>`;
  const price = escapeHtml(priceText(v?.priceMinor, v?.currency ?? shop.currency) ?? "");
  const edit = openButton(tc(locale, "tg.notify.edit"), `/dashboard/${shop.handle}/products/${product.id}`);

  let text: string;
  let keyboard: Button[][];
  switch (reason) {
    case "published":
      text = tc(locale, "tg.notify.listed_s_live_order_button", { title, price });
      keyboard = [
        [
          edit,
          { text: tc(locale, "tg.notify.hide"), callback_data: `lh:${product.id}` },
          { text: tc(locale, "store.product.sold"), callback_data: `ls:${product.id}` },
        ],
      ];
      break;
    case "needs_price":
      text = tc(locale, "tg.notify.saved_as_draft_what_s", { title });
      keyboard = [[edit, { text: tc(locale, "tg.notify.not_product"), callback_data: `ln:${product.id}` }]];
      break;
    case "confirm":
      text = tc(locale, "tg.notify.sale", { title });
      keyboard = [
        [
          { text: tc(locale, "tg.notify.yes_list"), callback_data: `lp:${product.id}` },
          { text: tc(locale, "tg.notify.not_product"), callback_data: `ln:${product.id}` },
        ],
      ];
      break;
    case "limited":
      text = tc(locale, "tg.notify.saved_as_draft_today_s", { title, price });
      keyboard = [[{ text: tc(locale, "tg.notify.publish"), callback_data: `lp:${product.id}` }, edit]];
      break;
    default:
      text = tc(locale, "tg.notify.draft_ready_check_details_publish", { title, price });
      keyboard = [
        [{ text: tc(locale, "tg.notify.publish"), callback_data: `lp:${product.id}` }, edit],
        [{ text: tc(locale, "tg.notify.not_product"), callback_data: `ln:${product.id}` }],
      ];
  }

  for (const r of await sellerRecipients(shop.id)) {
    const msgId = await sendOnce(`listing_receipt:${product.id}:${r.telegramId}`, r.telegramId, text, keyboard, {
      kind: "listing_receipt",
      refId: product.id,
    });
    if (msgId && reason === "needs_price") {
      await setBotContext(r.telegramId, "price", product.id, 24 * 60);
    }
  }
}

export async function setBotContext(telegramUserId: bigint, kind: "price" | "chat_reply", refId: string, minutes: number) {
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await db
    .insert(botContexts)
    .values({ telegramUserId, kind, refId, expiresAt })
    .onConflictDoUpdate({ target: botContexts.telegramUserId, set: { kind, refId, expiresAt, updatedAt: new Date() } });
}

export async function notifyRightsWarning(channelId: string) {
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!channel) return;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, channel.shopId) });
  const locale = shop ? shopLocale(shop) : "en";
  const isChannel = channel.chatType === "channel";
  const name = escapeHtml(channel.title ?? "Telegram");
  const text = isChannel
    ? tc(locale, "tg.notify.goods_can_t_add_order", { name })
    : tc(locale, "tg.notify.goods_lost_admin_rights_make", { name });
  const keyboard: Button[][] = [
    [{ text: tc(locale, "tg.notify.restore_rights"), url: isChannel ? channelRightsLink() : groupRightsLink() }],
  ];
  const day = new Date().toISOString().slice(0, 10);
  for (const r of await sellerRecipients(channel.shopId)) {
    await sendOnce(`rights_warning:${channelId}:${day}:${r.telegramId}`, r.telegramId, text, keyboard);
  }
}

export async function notifySourceDeleted(sourceId: string) {
  const source = await db.query.productSources.findFirst({
    where: eq(productSources.id, sourceId),
    with: { product: true, channel: true },
  });
  if (!source?.product) return;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, source.shopId) });
  if (!shop) return;
  const locale = shopLocale(shop);
  const text = tc(locale, "tg.notify.post_was_deleted_telegram_so", {
    title: escapeHtml(source.product.title),
  });
  const keyboard: Button[][] = [
    [
      openButton(
        tc(locale, "tg.notify.open_listing"),
        `/dashboard/${shop.handle}/products/${source.productId}`,
      ),
    ],
  ];
  for (const r of await sellerRecipients(shop.id)) {
    await sendOnce(`source_deleted:${sourceId}:${r.telegramId}`, r.telegramId, text, keyboard);
  }
}

// ── orders ──────────────────────────────────────────────────────────────────
function orderLinesText(o: { lines: { title: string; quantity: number }[] }) {
  return o.lines
    .slice(0, 6)
    .map((l) => `• ${escapeHtml(l.title)} × ${l.quantity}`)
    .join("\n");
}

async function loadOrder(orderId: string) {
  return db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { lines: true, shop: true } });
}

export async function notifyOrderPlaced(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o) return;
  const shop = o.shop as Shop;
  const locale = shopLocale(shop);
  const settings = normalizeSettings(shop.settings);
  const total = escapeHtml(formatMoney(o.totalMinor, o.currency) ?? "");
  const items = o.lines.reduce((a, l) => a + l.quantity, 0);

  if (settings.notifyOrders) {
    const headline =
      items === 1
        ? tc(locale, "tg.notify.new_order_one", { number: o.number, total })
        : tc(locale, "tg.notify.new_order_other", { number: o.number, items, total });
    const text = [
      headline,
      orderLinesText(o),
      "",
      `${escapeHtml(o.contactName)} · ${escapeHtml(formatPhone(o.contactPhone))}`,
      o.fulfillment === "delivery"
        ? `📍 ${escapeHtml(o.address ?? "")}`
        : tc(locale, "tg.notify.pickup"),
      o.notes ? `📝 ${escapeHtml(o.notes)}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    const keyboard: Button[][] = [
      [
        { text: tc(locale, "tg.notify.confirm"), callback_data: `oc:${o.id}` },
        openButton(tc(locale, "tg.notify.view_order"), `/dashboard/${shop.handle}/orders/${o.id}`),
      ],
    ];
    for (const r of await sellerRecipients(shop.id)) {
      await sendOnce(`order_placed:${o.id}:${r.telegramId}`, r.telegramId, text, keyboard, {
        kind: "order",
        refId: o.id,
      });
    }
  }

  if (o.buyerUserId) {
    const buyer = await db.query.users.findFirst({ where: eq(users.id, o.buyerUserId) });
    if (buyer) {
      const text = tc(locale, "tg.notify.order_placed_at_total_pay", {
        number: o.number,
        name: escapeHtml(shop.name),
        orderLinesText: `\n${orderLinesText(o)}\n`,
        total,
      });
      await sendOnce(`order_placed_buyer:${o.id}`, buyer.telegramId, text, [
        [
          openButton(
            tc(locale, "tg.notify.view_order"),
            `/s/${shop.handle}/orders/${o.number}?t=${o.accessToken}`,
          ),
        ],
      ]);
    }
  }
}

const STATUS_TEXT: Record<Locale, Record<string, string>> = {
  en: {
    confirmed: "✅ confirmed by the seller",
    shipped: "🚚 on its way",
    delivered: "📦 delivered",
    completed: "📦 completed",
    cancelled: "❌ cancelled",
  },
  am: {
    confirmed: "✅ በሻጩ ተረጋግጧል",
    shipped: "🚚 መንገድ ላይ ነው",
    delivered: "📦 ደርሷል",
    completed: "📦 ተጠናቋል",
    cancelled: "❌ ተሰርዟል",
  },
};

export async function notifyOrderStatus(orderId: string, status: string) {
  const o = await loadOrder(orderId);
  if (!o?.buyerUserId || !STATUS_TEXT.en[status]) return;
  const buyer = await db.query.users.findFirst({ where: eq(users.id, o.buyerUserId) });
  if (!buyer) return;
  const shop = o.shop as Shop;
  const locale = shopLocale(shop);
  const reason =
    status === "cancelled" && o.cancelReason
      ? `\n${tc(locale, "tg.notify.reason", { cancelReason: escapeHtml(o.cancelReason) })}`
      : "";
  const text = tc(locale, "tg.notify.order_at", {
    number: o.number,
    name: escapeHtml(shop.name),
    status: STATUS_TEXT[locale][status],
    reason,
  });
  await sendOnce(`order_status:${o.id}:${status}`, buyer.telegramId, text, [
    [
      openButton(
        tc(locale, "tg.notify.view_order"),
        `/s/${shop.handle}/orders/${o.number}?t=${o.accessToken}`,
      ),
    ],
  ]);
}

export async function notifyOrderReminder(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o || o.status !== "placed") return;
  const shop = o.shop as Shop;
  const locale = shopLocale(shop);
  const text = tc(locale, "tg.notify.order_from_waiting_confirmation_unconfirmed", {
    number: o.number,
    contactName: escapeHtml(o.contactName),
  });
  const keyboard: Button[][] = [
    [
      { text: tc(locale, "tg.notify.confirm"), callback_data: `oc:${o.id}` },
      openButton(tc(locale, "tg.notify.view_order"), `/dashboard/${shop.handle}/orders/${o.id}`),
    ],
  ];
  for (const r of await sellerRecipients(shop.id)) {
    await sendOnce(`order_reminder:${o.id}:${o.remindersSent}:${r.telegramId}`, r.telegramId, text, keyboard);
  }
}

// ── chat ────────────────────────────────────────────────────────────────────
export async function notifyChatMessage(messageId: string, direction: "seller" | "buyer") {
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
  if (!msg) return;
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, msg.conversationId) });
  if (!conv) return;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, conv.shopId) });
  if (!shop) return;
  const product = conv.productId
    ? await db.query.products.findFirst({ where: eq(products.id, conv.productId), with: { variants: true } })
    : null;
  const locale = shopLocale(shop);
  const quote = msg.body
    ? escapeHtml(msg.body.slice(0, 500))
    : tc(locale, "tg.notify.photo");
  const about = product
    ? `<b>${escapeHtml(product.title)}</b> · ${escapeHtml(priceText(product.variants[0]?.priceMinor, product.variants[0]?.currency ?? "ETB") ?? "")}`
    : `<b>${escapeHtml(shop.name)}</b>`;
  const openChat = locale === "am" ? "ውይይት ይክፈቱ" : "Open chat";

  if (direction === "seller") {
    if (!normalizeSettings(shop.settings).notifyMessages) return;
    const buyer = await db.query.users.findFirst({ where: eq(users.id, conv.buyerUserId) });
    const who = buyer
      ? `${escapeHtml(buyer.firstName)}${buyer.username ? ` (@${escapeHtml(buyer.username)})` : ""}`
      : tc(locale, "tg.notify.buyer");
    const text = tc(locale, "tg.notify.about_reply_message_answer", { who, about, quote });
    const keyboard: Button[][] = [
      [
        { text: tc(locale, "tg.notify.reply"), callback_data: `cr:${conv.id}` },
        openButton(openChat, `/dashboard/${shop.handle}/inbox/${conv.id}`),
      ],
    ];
    for (const r of await sellerRecipients(shop.id)) {
      await sendOnce(`chat:${msg.id}:${r.telegramId}`, r.telegramId, text, keyboard, {
        kind: "chat",
        refId: conv.id,
      });
    }
    return;
  }

  const buyer = await db.query.users.findFirst({ where: eq(users.id, conv.buyerUserId) });
  if (!buyer) return;
  const text = tc(locale, "tg.notify.replied_about_reply_message_answer", {
    name: escapeHtml(shop.name),
    about,
    quote,
  });
  await sendOnce(
    `chat:${msg.id}:${buyer.telegramId}`,
    buyer.telegramId,
    text,
    [[openButton(openChat, `/inbox/${conv.id}`)]],
    { kind: "chat", refId: conv.id },
  );
}

export async function notifyOps(text: string, key: string) {
  if (!serverEnv.OPS_TELEGRAM_CHAT_ID) {
    log.warn("ops alert (no OPS_TELEGRAM_CHAT_ID)", { text });
    return;
  }
  await sendOnce(`ops:${key}`, BigInt(serverEnv.OPS_TELEGRAM_CHAT_ID), `🚨 ${escapeHtml(text)}`);
}

export async function sourcePostLink(sourceId: string) {
  const s = await db.query.productSources.findFirst({ where: eq(productSources.id, sourceId), with: { channel: true } });
  if (!s?.channel) return null;
  return postLink({ username: s.channel.username, chatId: s.chatId, messageId: s.messageId });
}
