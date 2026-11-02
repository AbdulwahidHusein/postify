import "server-only";

import { Bot, type Context } from "grammy";
import type { InlineKeyboardButton, KeyboardButton, UserFromGetMe } from "grammy/types";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { botContexts, channels, products, telegramDeliveries } from "@/server/db/schema";
import { appUrl, botUsername, requireBotToken } from "@/server/env";
import { log } from "@/server/log";
import { escapeHtml } from "@/server/services/telegram";
import { createLoginTokenForIdentity, redirectPathFromStartPayload } from "@/server/auth/login-tokens";
import { upsertTelegramUser } from "@/server/auth/users";
import type { TelegramIdentity } from "@/server/auth/telegram";
import { can } from "@/server/auth/authorize";
import { getShopById, memberRole } from "@/server/domain/shops";
import {
  getChannelByChatId,
  isLinkableType,
  linkChat,
  markChatDisconnected,
  refreshChannelRights,
} from "@/server/domain/channels";
import { getProductBundle, updateProduct } from "@/server/domain/products";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";
import { applyOrderAction } from "@/server/domain/orders";
import { conversationAccess, sendMessage } from "@/server/domain/chat";
import { parsePriceReply } from "@/server/domain/ingest-rules";
import { setBotContext } from "@/server/domain/notify";
import { acceptInvite } from "@/server/domain/members";
import { formatMoney, toMinor } from "@/lib/money";

const REQUEST_CHANNEL = 1;
const REQUEST_GROUP = 2;

function identityFrom(from: NonNullable<Context["from"]>): TelegramIdentity {
  return {
    telegramId: BigInt(from.id),
    firstName: from.first_name,
    lastName: from.last_name,
    username: from.username,
    languageCode: from.language_code,
    isPremium: Boolean(from.is_premium),
    photoUrl: undefined,
  };
}

function open(text: string, path: string): InlineKeyboardButton {
  const url = `${appUrl()}${path}`;
  return url.startsWith("https://") ? { text, web_app: { url } } : { text, url };
}

/** Reply keyboard with Telegram's chat picker: only chats the user administers. */
function connectKeyboard(): KeyboardButton[][] {
  const rights = {
    is_anonymous: false,
    can_manage_chat: false,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: false,
    can_post_stories: false,
    can_edit_stories: false,
    can_delete_stories: false,
    can_send_welcome_messages: false,
  };
  return [
    [
      {
        text: "➕ Connect channel",
        request_chat: {
          request_id: REQUEST_CHANNEL,
          chat_is_channel: true,
          user_administrator_rights: { ...rights, can_post_messages: true, can_edit_messages: true },
          bot_administrator_rights: { ...rights, can_post_messages: true, can_edit_messages: true },
          request_title: true,
          request_username: true,
        },
      },
      {
        text: "➕ Connect group",
        request_chat: {
          request_id: REQUEST_GROUP,
          chat_is_channel: false,
          // Admin status lets the bot see members' posts despite privacy mode.
          user_administrator_rights: { ...rights, can_pin_messages: true },
          bot_administrator_rights: { ...rights, can_pin_messages: true },
          request_title: true,
          request_username: true,
        },
      },
    ],
  ];
}

const WELCOME = [
  "<b>Goods turns your Telegram channel or group into an online shop.</b>",
  "",
  "1. Tap <b>Connect channel</b> (or <b>Connect group</b>) below and pick your chat.",
  "2. Keep posting products as usual: a photo and a price.",
  "3. Each post becomes a product with an <b>Order</b> button, and orders arrive here.",
].join("\n");

async function requireUser(ctx: Context) {
  if (!ctx.from) return null;
  return upsertTelegramUser(identityFrom(ctx.from));
}

async function productAccess(userId: string, productId: string) {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) return null;
  const role = await memberRole(product.shopId, userId);
  if (!role || !can(role, "products.manage")) return null;
  const shop = await getShopById(product.shopId);
  return shop ? { product, shop } : null;
}

async function setPriceFromTelegram(ctx: Context, userId: string, productId: string, text: string) {
  const price = parsePriceReply(text);
  if (price === null) {
    await ctx.reply("Send just the price as a number, for example 4500.");
    return true;
  }
  const access = await productAccess(userId, productId);
  if (!access) return false;
  const minor = toMinor(price);
  const updated = await updateProduct(access.shop, productId, {
    price: minor,
    ...(access.product.status === "draft" ? { status: "published" as const } : {}),
  });
  await scheduleButtonSyncForProducts(access.shop.id, [productId]);
  await db.delete(botContexts).where(eq(botContexts.telegramUserId, BigInt(ctx.from!.id)));
  await ctx.reply(
    `✅ Price set: ${escapeHtml(formatMoney(minor, updated.variants[0]?.currency ?? "ETB") ?? "")}. <b>${escapeHtml(updated.title)}</b> is live.`,
    { parse_mode: "HTML" },
  );
  return true;
}

export function buildBot(botInfo?: UserFromGetMe): Bot {
  const bot = new Bot(requireBotToken(), botInfo ? { botInfo } : undefined);

  bot.catch((err) => log.error("bot handler error", { err: err.error }));

  // ── /start ──────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const user = await requireUser(ctx);
    const payload = String(ctx.match ?? "").trim();

    if (payload === "auth" || payload === "auth_inbox" || payload.startsWith("auth_")) {
      const { token } = await createLoginTokenForIdentity(identityFrom(ctx.from), {
        redirectPath: redirectPathFromStartPayload(payload),
      });
      await ctx.reply("Tap below to sign in to Goods.", {
        reply_markup: { inline_keyboard: [[{ text: "Sign in", url: `${appUrl()}/auth/telegram?token=${token}` }]] },
      });
      return;
    }
    if (payload.startsWith("join_") && user) {
      try {
        const invite = await acceptInvite(payload.slice(5), user.id);
        const shop = await getShopById(invite.shopId);
        await ctx.reply(`✅ You joined <b>${escapeHtml(shop?.name ?? "the shop")}</b> as ${invite.role}.`, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[open("Open dashboard", `/dashboard/${shop?.handle ?? ""}`)]] },
        });
      } catch {
        await ctx.reply("This invite link has expired or was already used. Ask the shop owner for a new one.");
      }
      return;
    }
    if (payload.startsWith("c_") && user) {
      const conversationId = payload.slice(2);
      try {
        const { role, conv } = await conversationAccess(conversationId, user.id);
        const shop = await getShopById(conv.shopId);
        const path = role === "seller" && shop ? `/dashboard/${shop.handle}/inbox/${conv.id}` : `/inbox/${conv.id}`;
        await ctx.reply("Open the conversation:", { reply_markup: { inline_keyboard: [[open("Open chat", path)]] } });
        return;
      } catch {
        // fall through to the welcome message
      }
    }

    await ctx.reply(WELCOME, {
      parse_mode: "HTML",
      reply_markup: { keyboard: connectKeyboard(), resize_keyboard: true, is_persistent: false },
    });
    await ctx.reply("Already set up?", { reply_markup: { inline_keyboard: [[open("Open dashboard", "/dashboard")]] } });
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply(WELCOME, {
      parse_mode: "HTML",
      reply_markup: { keyboard: connectKeyboard(), resize_keyboard: true },
    });
  });

  bot.command("status", async (ctx) => {
    if (!isLinkableType(ctx.chat.type)) {
      await ctx.reply("Run /status inside your connected channel or group.");
      return;
    }
    const channel = await getChannelByChatId(BigInt(ctx.chat.id));
    if (!channel || channel.status !== "connected") {
      await ctx.reply(`Not connected. Open @${botUsername()} and tap Connect.`);
      return;
    }
    const shop = await getShopById(channel.shopId);
    await ctx.reply(`Connected to ${shop?.name ?? "a Goods shop"}.`);
  });

  // ── chat picker result ──────────────────────────────────────────────────
  bot.on("message:chat_shared", async (ctx) => {
    const shared = ctx.message.chat_shared;
    const user = await requireUser(ctx);
    if (!user || !ctx.from) return;
    const isChannel = shared.request_id === REQUEST_CHANNEL;
    const result = await linkChat({
      userId: user.id,
      telegramUserId: ctx.from.id,
      chat: {
        id: shared.chat_id,
        type: isChannel ? "channel" : "supergroup",
        title: shared.title ?? null,
        username: shared.username ?? null,
      },
      // Telegram only lists chats where the user has the requested admin rights.
      adminVerified: true,
    });
    // The real chat type (group vs supergroup) comes from the rights refresh.
    if (result.status === "linked" || result.status === "already_linked") {
      try {
        const chat = await ctx.api.getChat(shared.chat_id);
        if (isLinkableType(chat.type) && chat.type !== result.channel.chatType) {
          await db.update(channels).set({ chatType: chat.type }).where(eq(channels.id, result.channel.id));
        }
      } catch {
        /* keep the guessed type */
      }
      const shop = result.shop;
      const what = isChannel ? "Post a photo with a price in your channel" : "Admins can now post a photo with a price in the group";
      await ctx.reply(
        `✅ <b>${escapeHtml(shared.title ?? "Your chat")}</b> is connected to <b>${escapeHtml(shop.name)}</b>.\n${what} and it becomes a product with an Order button.`,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[open("Open dashboard", `/dashboard/${shop.handle}`)]] },
        },
      );
      return;
    }
    const msg =
      result.status === "conflict"
        ? "That chat is already connected to another Goods shop."
        : result.status === "not_admin"
          ? "Only admins of that chat can connect it."
          : "That chat type isn't supported.";
    await ctx.reply(msg);
  });

  // ── bot added/removed/promoted in a chat ────────────────────────────────
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (!isLinkableType(chat.type)) return;
    const status = ctx.myChatMember.new_chat_member.status;
    const chatId = BigInt(chat.id);

    if (status === "left" || status === "kicked") {
      await markChatDisconnected(chatId);
      return;
    }
    const existing = await getChannelByChatId(chatId);
    if (existing && existing.status === "connected") {
      try {
        await refreshChannelRights(existing);
      } catch (err) {
        log.warn("refresh rights failed", { err });
      }
      return;
    }
    // Added through Telegram's own UI rather than our chat picker: link it if
    // the person who added the bot really is an admin (verified in linkChat).
    const from = ctx.from;
    if (!from || from.is_bot) return;
    if (chat.type !== "channel" && status !== "administrator") return;
    const user = await upsertTelegramUser(identityFrom(from));
    const result = await linkChat({
      userId: user.id,
      telegramUserId: from.id,
      chat: { id: chat.id, type: chat.type, title: "title" in chat ? chat.title : null, username: "username" in chat ? (chat.username ?? null) : null },
    });
    if (result.status === "linked" || result.status === "already_linked") {
      try {
        await ctx.api.sendMessage(
          from.id,
          `✅ <b>${escapeHtml(result.channel.title ?? "Your chat")}</b> is connected to <b>${escapeHtml(result.shop.name)}</b>.`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: [[open("Open dashboard", `/dashboard/${result.shop.handle}`)]] } },
        );
      } catch {
        // The user never started the bot; they'll see it in the dashboard.
      }
    }
  });

  // ── inline buttons on receipts and alerts ───────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [action, id] = data.split(":");
    const user = await requireUser(ctx);
    if (!user || !id) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      if (action === "cr") {
        const { role } = await conversationAccess(id, user.id);
        if (role !== "seller") throw new Error("not seller");
        await setBotContext(BigInt(ctx.from.id), "chat_reply", id, 30);
        await ctx.answerCallbackQuery({ text: "Send your reply as the next message" });
        await ctx.reply("✍️ Type your reply:");
        return;
      }
      if (action === "oc") {
        const order = await db.query.orders.findFirst({ where: (o, { eq: e }) => e(o.id, id) });
        const role = order ? await memberRole(order.shopId, user.id) : null;
        if (!order || !role || !can(role, "orders.manage")) throw new Error("no access");
        await applyOrderAction({ shopId: order.shopId, orderId: id, action: "confirm", actorUserId: user.id });
        await ctx.answerCallbackQuery({ text: "Order confirmed" });
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [[{ text: "✅ Confirmed", callback_data: "noop:x" }]] } }).catch(() => undefined);
        return;
      }
      if (["lp", "ln", "lh", "ls"].includes(action)) {
        const access = await productAccess(user.id, id);
        if (!access) throw new Error("no access");
        const { shop, product } = access;
        if (action === "ln") {
          await db.delete(products).where(and(eq(products.id, id), eq(products.shopId, shop.id)));
          await ctx.answerCallbackQuery({ text: "Removed" });
          await ctx.editMessageText(`🗑 Removed: ${escapeHtml(product.title)}`, { parse_mode: "HTML" }).catch(() => undefined);
          return;
        }
        if (action === "lp") {
          const bundle = await getProductBundle(shop.id, id);
          if (bundle?.variants[0]?.priceMinor == null) {
            await setBotContext(BigInt(ctx.from.id), "price", id, 24 * 60);
            await ctx.answerCallbackQuery();
            await ctx.reply(`What's the price of <b>${escapeHtml(product.title)}</b>? Send a number, for example 4500.`, { parse_mode: "HTML" });
            return;
          }
        }
        const status = action === "lp" ? "published" : action === "lh" ? "archived" : "sold";
        await updateProduct(shop, id, { status });
        await scheduleButtonSyncForProducts(shop.id, [id]);
        const label = status === "published" ? "✅ Published" : status === "archived" ? "🙈 Hidden" : "Marked sold";
        await ctx.answerCallbackQuery({ text: label });
        await ctx
          .editMessageReplyMarkup({
            reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop:x" }, open("✏️ Edit", `/dashboard/${shop.handle}/products/${id}`)]] },
          })
          .catch(() => undefined);
        return;
      }
      await ctx.answerCallbackQuery();
    } catch (err) {
      log.warn("callback failed", { action, err });
      await ctx.answerCallbackQuery({ text: "That action isn't available any more.", show_alert: false }).catch(() => undefined);
    }
  });

  // ── private messages: replies to notifications, price replies ───────────
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from) return next();
    const text = ctx.message.text ?? ctx.message.caption ?? "";
    if (!text || text.startsWith("/")) return next();
    const user = await requireUser(ctx);
    if (!user) return;

    const replyTo = ctx.message.reply_to_message?.message_id;
    if (replyTo) {
      const delivery = await db.query.telegramDeliveries.findFirst({
        where: and(
          eq(telegramDeliveries.telegramChatId, BigInt(ctx.chat.id)),
          eq(telegramDeliveries.telegramMessageId, replyTo),
        ),
      });
      if (delivery?.kind === "chat") {
        await replyInConversation(ctx, user.id, delivery.refId, text);
        return;
      }
      if (delivery?.kind === "listing_receipt") {
        if (await setPriceFromTelegram(ctx, user.id, delivery.refId, text)) return;
      }
    }

    const context = await db.query.botContexts.findFirst({
      where: eq(botContexts.telegramUserId, BigInt(ctx.from.id)),
    });
    if (context && context.expiresAt > new Date()) {
      if (context.kind === "chat_reply") {
        await replyInConversation(ctx, user.id, context.refId, text);
        await db.delete(botContexts).where(eq(botContexts.telegramUserId, BigInt(ctx.from.id)));
        return;
      }
      if (context.kind === "price" && parsePriceReply(text) !== null) {
        if (await setPriceFromTelegram(ctx, user.id, context.refId, text)) return;
      }
    }

    if (ctx.message.forward_origin) {
      await ctx.reply("To connect a channel, tap “Connect channel” below and pick it from the list.", {
        reply_markup: { keyboard: connectKeyboard(), resize_keyboard: true },
      });
      return;
    }
    await ctx.reply("Reply to a notification to answer it, or open your dashboard.", {
      reply_markup: { inline_keyboard: [[open("Open dashboard", "/dashboard")]] },
    });
  });

  return bot;
}

async function replyInConversation(ctx: Context, userId: string, conversationId: string, text: string) {
  try {
    const { role } = await conversationAccess(conversationId, userId);
    await sendMessage({ conversationId, userId, role, body: text, via: "telegram" });
    await ctx.reply("✓ Sent", { reply_parameters: { message_id: ctx.message!.message_id } });
  } catch (err) {
    log.warn("telegram chat reply failed", { err });
    await ctx.reply("Couldn't send that reply. Open the chat in Goods instead.");
  }
}

// ── singleton ───────────────────────────────────────────────────────────────
const g = globalThis as unknown as { goodsBot?: Bot; goodsBotInit?: Promise<void> };

export async function getBot(): Promise<Bot> {
  if (!g.goodsBot) g.goodsBot = buildBot();
  if (!g.goodsBot.isInited()) {
    g.goodsBotInit ??= g.goodsBot.init();
    await g.goodsBotInit;
  }
  return g.goodsBot;
}

/** Tests: install a bot with fixed identity so no getMe call is needed. */
export function setBotForTests(bot: Bot | null) {
  g.goodsBot = bot ?? undefined;
  g.goodsBotInit = undefined;
}

