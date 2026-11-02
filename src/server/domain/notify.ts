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

type Button = InlineKeyboardButton;

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
  const v = product.variants[0];
  const title = `<b>${escapeHtml(product.title)}</b>`;
  const price = escapeHtml(priceText(v?.priceMinor, v?.currency ?? shop.currency) ?? "");
  const edit = openButton("✏️ Edit", `/dashboard/${shop.handle}/products/${product.id}`);

  let text: string;
  let keyboard: Button[][];
  switch (reason) {
    case "published":
      text = `✅ Listed: ${title} · ${price}\nIt's live with an Order button on your post.`;
      keyboard = [[edit, { text: "🙈 Hide", callback_data: `lh:${product.id}` }, { text: "Sold", callback_data: `ls:${product.id}` }]];
      break;
    case "needs_price":
      text = `📝 Saved as a draft: ${title}\nWhat's the price? <b>Reply to this message</b> with a number, for example 4500.`;
      keyboard = [[edit, { text: "Not a product", callback_data: `ln:${product.id}` }]];
      break;
    case "confirm":
      text = `❓ Is this for sale? ${title}`;
      keyboard = [[{ text: "Yes, list it", callback_data: `lp:${product.id}` }, { text: "Not a product", callback_data: `ln:${product.id}` }]];
      break;
    case "limited":
      text = `📝 Saved as a draft: ${title} · ${price}\nToday's automatic reading limit was reached, so please check the details and publish.`;
      keyboard = [[{ text: "✅ Publish", callback_data: `lp:${product.id}` }, edit]];
      break;
    default:
      text = `📝 Draft ready: ${title} · ${price}\nCheck the details and publish.`;
      keyboard = [[{ text: "✅ Publish", callback_data: `lp:${product.id}` }, edit], [{ text: "Not a product", callback_data: `ln:${product.id}` }]];
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
  const isChannel = channel.chatType === "channel";
  const name = escapeHtml(channel.title ?? "your chat");
  const text = isChannel
    ? `⚠️ Goods can't add Order buttons to posts in <b>${name}</b> because it no longer has the "Edit messages of others" right. Listings still get a small card under each post.\n\nTap below to restore the right in one step.`
    : `⚠️ Goods lost admin rights in <b>${name}</b>. Make the bot an admin again so new posts become products.`;
  const keyboard: Button[][] = [[{ text: "Restore rights", url: isChannel ? channelRightsLink() : groupRightsLink() }]];
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
  const text = `🗑 The post for <b>${escapeHtml(source.product.title)}</b> was deleted in Telegram, so the listing is now hidden.`;
  const keyboard: Button[][] = [[openButton("Open listing", `/dashboard/${shop.handle}/products/${source.productId}`)]];
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
  const settings = normalizeSettings(shop.settings);
  const total = escapeHtml(formatMoney(o.totalMinor, o.currency) ?? "");
  const items = o.lines.reduce((a, l) => a + l.quantity, 0);

  if (settings.notifyOrders) {
    const text = [
      `🛒 <b>New order #${o.number}</b> · ${items} item${items === 1 ? "" : "s"} · ${total} · Pay on delivery`,
      orderLinesText(o),
      "",
      `${escapeHtml(o.contactName)} · ${escapeHtml(formatPhone(o.contactPhone))}`,
      o.fulfillment === "delivery" ? `📍 ${escapeHtml(o.address ?? "")}` : "🏬 Pickup",
      o.notes ? `📝 ${escapeHtml(o.notes)}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    const keyboard: Button[][] = [
      [{ text: "✅ Confirm", callback_data: `oc:${o.id}` }, openButton("Open order", `/dashboard/${shop.handle}/orders/${o.id}`)],
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
      const text = `🧾 <b>Order #${o.number} placed</b> at ${escapeHtml(shop.name)}\n${orderLinesText(o)}\nTotal ${total} · Pay on delivery\n\nThe seller will confirm shortly. You'll get updates here.`;
      await sendOnce(`order_placed_buyer:${o.id}`, buyer.telegramId, text, [
        [openButton("View order", `/s/${shop.handle}/orders/${o.number}?t=${o.accessToken}`)],
      ]);
    }
  }
}

const STATUS_TEXT: Record<string, string> = {
  confirmed: "✅ confirmed by the seller",
  shipped: "🚚 on its way",
  delivered: "📦 delivered",
  completed: "📦 completed",
  cancelled: "❌ cancelled",
};

export async function notifyOrderStatus(orderId: string, status: string) {
  const o = await loadOrder(orderId);
  if (!o?.buyerUserId || !STATUS_TEXT[status]) return;
  const buyer = await db.query.users.findFirst({ where: eq(users.id, o.buyerUserId) });
  if (!buyer) return;
  const shop = o.shop as Shop;
  const reason = status === "cancelled" && o.cancelReason ? `\nReason: ${escapeHtml(o.cancelReason)}` : "";
  const text = `Order #${o.number} at ${escapeHtml(shop.name)} is ${STATUS_TEXT[status]}.${reason}`;
  await sendOnce(`order_status:${o.id}:${status}`, buyer.telegramId, text, [
    [openButton("View order", `/s/${shop.handle}/orders/${o.number}?t=${o.accessToken}`)],
  ]);
}

export async function notifyOrderReminder(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o || o.status !== "placed") return;
  const shop = o.shop as Shop;
  const text = `⏰ Order #${o.number} from ${escapeHtml(o.contactName)} is waiting for your confirmation. Unconfirmed orders are cancelled after 72 hours.`;
  const keyboard: Button[][] = [
    [{ text: "✅ Confirm", callback_data: `oc:${o.id}` }, openButton("Open order", `/dashboard/${shop.handle}/orders/${o.id}`)],
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
  const quote = msg.body ? escapeHtml(msg.body.slice(0, 500)) : "📷 Photo";
  const about = product
    ? `<b>${escapeHtml(product.title)}</b> · ${escapeHtml(priceText(product.variants[0]?.priceMinor, product.variants[0]?.currency ?? "ETB") ?? "")}`
    : `<b>${escapeHtml(shop.name)}</b>`;

  if (direction === "seller") {
    if (!normalizeSettings(shop.settings).notifyMessages) return;
    const buyer = await db.query.users.findFirst({ where: eq(users.id, conv.buyerUserId) });
    const who = buyer ? `${escapeHtml(buyer.firstName)}${buyer.username ? ` (@${escapeHtml(buyer.username)})` : ""}` : "A buyer";
    const text = `💬 ${who} about ${about}\n\n“${quote}”\n\n<i>Reply to this message to answer.</i>`;
    const keyboard: Button[][] = [
      [{ text: "↩️ Reply", callback_data: `cr:${conv.id}` }, openButton("Open chat", `/dashboard/${shop.handle}/inbox/${conv.id}`)],
    ];
    for (const r of await sellerRecipients(shop.id)) {
      await sendOnce(`chat:${msg.id}:${r.telegramId}`, r.telegramId, text, keyboard, { kind: "chat", refId: conv.id });
    }
    return;
  }

  const buyer = await db.query.users.findFirst({ where: eq(users.id, conv.buyerUserId) });
  if (!buyer) return;
  const text = `💬 ${escapeHtml(shop.name)} replied about ${about}\n\n“${quote}”\n\n<i>Reply to this message to answer.</i>`;
  await sendOnce(`chat:${msg.id}:${buyer.telegramId}`, buyer.telegramId, text, [[openButton("Open chat", `/inbox/${conv.id}`)]], {
    kind: "chat",
    refId: conv.id,
  });
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
