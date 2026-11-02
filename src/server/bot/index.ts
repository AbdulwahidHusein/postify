import "server-only";

import { Bot, type Context } from "grammy";
import type { InlineKeyboardButton, KeyboardButton, UserFromGetMe } from "grammy/types";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { botContexts, channels, products, telegramDeliveries } from "@/server/db/schema";
import { botUsername, requireBotToken } from "@/server/env";
import { log } from "@/server/log";
import { escapeHtml, webLink } from "@/server/services/telegram";
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
import { localeFromTelegram, tc, type Locale } from "@/i18n/catalog";

const REQUEST_CHANNEL = 1;
const REQUEST_GROUP = 2;

function lang(ctx: Context): Locale {
  return localeFromTelegram(ctx.from?.language_code);
}

function welcomeText(locale: Locale) {
  return [
    tc(locale, "tg.bot.goods_turns_telegram_channel_group"),
    "",
    tc(locale, "tg.bot.1_tap_connect_channel_connect"),
    tc(locale, "tg.bot.2_keep_posting_products_as"),
    tc(locale, "tg.bot.3_each_post_becomes_product"),
  ].join("\n");
}

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
  return { text, url: webLink(path) };
}

/** Reply keyboard with Telegram's chat picker: only chats the user administers. */
function connectKeyboard(locale: Locale): KeyboardButton[][] {
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
        text: tc(locale, "tg.bot.connect_channel"),
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
        text: tc(locale, "tg.bot.connect_group"),
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
  const locale = lang(ctx);
  const price = parsePriceReply(text);
  if (price === null) {
    await ctx.reply(tc(locale, "tg.bot.send_just_price_as_number"));
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
    tc(locale, "tg.bot.price_set", {
      price: escapeHtml(formatMoney(minor, updated.variants[0]?.currency ?? "ETB") ?? ""),
      title: escapeHtml(updated.title),
    }),
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
    const locale = lang(ctx);
    const user = await requireUser(ctx);
    const payload = String(ctx.match ?? "").trim();

    if (payload === "auth" || payload === "auth_inbox" || payload.startsWith("auth_")) {
      const { token } = await createLoginTokenForIdentity(identityFrom(ctx.from), {
        redirectPath: redirectPathFromStartPayload(payload),
      });
      await ctx.reply(tc(locale, "tg.bot.tap_below_sign_goods"), {
        reply_markup: {
          inline_keyboard: [
            [{ text: tc(locale, "store.login.openBot"), url: webLink(`/auth/telegram?token=${token}`) }],
          ],
        },
      });
      return;
    }
    if (payload.startsWith("join_") && user) {
      try {
        const invite = await acceptInvite(payload.slice(5), user.id);
        const shop = await getShopById(invite.shopId);
        const joinKey = invite.role === "admin" ? "tg.bot.joined_admin" : "tg.bot.joined_staff";
        await ctx.reply(
          tc(locale, joinKey, { shop: escapeHtml(shop?.name ?? "Goods") }),
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [open(tc(locale, "tg.bot.open_dashboard"), `/dashboard/${shop?.handle ?? ""}`)],
              ],
            },
          },
        );
      } catch {
        await ctx.reply(tc(locale, "tg.bot.invite_link_has_expired_was"));
      }
      return;
    }
    if (payload.startsWith("c_") && user) {
      const conversationId = payload.slice(2);
      try {
        const { role, conv } = await conversationAccess(conversationId, user.id);
        const shop = await getShopById(conv.shopId);
        const path = role === "seller" && shop ? `/dashboard/${shop.handle}/inbox/${conv.id}` : `/inbox/${conv.id}`;
        await ctx.reply(tc(locale, "tg.bot.open_conversation"), {
          reply_markup: {
            inline_keyboard: [
              [open(locale === "am" ? "ውይይት ይክፈቱ" : "Open chat", path)],
            ],
          },
        });
        return;
      } catch {
        // fall through to the welcome message
      }
    }

    await ctx.reply(welcomeText(locale), {
      parse_mode: "HTML",
      reply_markup: { keyboard: connectKeyboard(locale), resize_keyboard: true, is_persistent: false },
    });
    await ctx.reply(tc(locale, "tg.bot.already_set_up"), {
      reply_markup: {
        inline_keyboard: [[open(tc(locale, "tg.bot.open_dashboard"), "/dashboard")]],
      },
    });
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const locale = lang(ctx);
    await ctx.reply(welcomeText(locale), {
      parse_mode: "HTML",
      reply_markup: { keyboard: connectKeyboard(locale), resize_keyboard: true },
    });
  });

  bot.command("status", async (ctx) => {
    const locale = lang(ctx);
    if (!isLinkableType(ctx.chat.type)) {
      await ctx.reply(tc(locale, "tg.bot.run_status_inside_connected_channel"));
      return;
    }
    const channel = await getChannelByChatId(BigInt(ctx.chat.id));
    if (!channel || channel.status !== "connected") {
      await ctx.reply(
        tc(locale, "tg.bot.not_connected_open_tap_connect", { botUsername: botUsername() }),
      );
      return;
    }
    const shop = await getShopById(channel.shopId);
    await ctx.reply(tc(locale, "tg.bot.connected", { Goods: shop?.name ?? "Goods" }));
  });

  // ── chat picker result ──────────────────────────────────────────────────
  bot.on("message:chat_shared", async (ctx) => {
    const shared = ctx.message.chat_shared;
    const locale = lang(ctx);
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
      const connectKey = isChannel ? "tg.bot.connected_channel" : "tg.bot.connected_group";
      await ctx.reply(
        tc(locale, connectKey, {
          chat: escapeHtml(shared.title ?? "Telegram"),
          shop: escapeHtml(shop.name),
        }),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[open(tc(locale, "tg.bot.open_dashboard"), `/dashboard/${shop.handle}`)]],
          },
        },
      );
      return;
    }
    const msg =
      result.status === "conflict"
        ? tc(locale, "tg.bot.chat_already_connected_another_goods")
        : result.status === "not_admin"
          ? tc(locale, "tg.bot.only_admins_chat_can_connect")
          : tc(locale, "tg.bot.chat_type_isn_t_supported");
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
      const locale = localeFromTelegram(from.language_code);
      try {
        await ctx.api.sendMessage(
          from.id,
          tc(locale, "tg.bot.connected_short", {
            chat: escapeHtml(result.channel.title ?? "Telegram"),
            shop: escapeHtml(result.shop.name),
          }),
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [open(tc(locale, "tg.bot.open_dashboard"), `/dashboard/${result.shop.handle}`)],
              ],
            },
          },
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
    const locale = lang(ctx);
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
        await ctx.answerCallbackQuery({ text: tc(locale, "tg.bot.send_reply_as_next_message") });
        await ctx.reply(tc(locale, "tg.bot.type_reply"));
        return;
      }
      if (action === "oc") {
        const order = await db.query.orders.findFirst({ where: (o, { eq: e }) => e(o.id, id) });
        const role = order ? await memberRole(order.shopId, user.id) : null;
        if (!order || !role || !can(role, "orders.manage")) throw new Error("no access");
        await applyOrderAction({ shopId: order.shopId, orderId: id, action: "confirm", actorUserId: user.id });
        await ctx.answerCallbackQuery({ text: tc(locale, "tg.bot.order_confirmed") });
        await ctx
          .editMessageReplyMarkup({
            reply_markup: {
              inline_keyboard: [[{ text: tc(locale, "tg.bot.confirmed"), callback_data: "noop:x" }]],
            },
          })
          .catch(() => undefined);
        return;
      }
      if (["lp", "ln", "lh", "ls"].includes(action)) {
        const access = await productAccess(user.id, id);
        if (!access) throw new Error("no access");
        const { shop, product } = access;
        if (action === "ln") {
          await db.delete(products).where(and(eq(products.id, id), eq(products.shopId, shop.id)));
          await ctx.answerCallbackQuery({ text: tc(locale, "tg.bot.removed") });
          await ctx
            .editMessageText(tc(locale, "tg.bot.removed_2", { title: escapeHtml(product.title) }), {
              parse_mode: "HTML",
            })
            .catch(() => undefined);
          return;
        }
        if (action === "lp") {
          const bundle = await getProductBundle(shop.id, id);
          if (bundle?.variants[0]?.priceMinor == null) {
            await setBotContext(BigInt(ctx.from.id), "price", id, 24 * 60);
            await ctx.answerCallbackQuery();
            await ctx.reply(
              tc(locale, "tg.bot.what_s_price_send_number", {
                title: escapeHtml(product.title),
              }),
              { parse_mode: "HTML" },
            );
            return;
          }
        }
        const status = action === "lp" ? "published" : action === "lh" ? "archived" : "sold";
        await updateProduct(shop, id, { status });
        await scheduleButtonSyncForProducts(shop.id, [id]);
        const label =
          status === "published"
            ? tc(locale, "tg.bot.published")
            : status === "archived"
              ? tc(locale, "tg.notify.hide")
              : tc(locale, "store.product.sold");
        await ctx.answerCallbackQuery({ text: label });
        await ctx
          .editMessageReplyMarkup({
            reply_markup: {
              inline_keyboard: [
                [
                  { text: label, callback_data: "noop:x" },
                  open(tc(locale, "tg.bot.edit"), `/dashboard/${shop.handle}/products/${id}`),
                ],
              ],
            },
          })
          .catch(() => undefined);
        return;
      }
      await ctx.answerCallbackQuery();
    } catch (err) {
      log.warn("callback failed", { action, err });
      await ctx
        .answerCallbackQuery({
          text: tc(locale, "tg.bot.action_isn_t_available_any"),
          show_alert: false,
        })
        .catch(() => undefined);
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

    const locale = lang(ctx);
    if (ctx.message.forward_origin) {
      await ctx.reply(tc(locale, "tg.bot.connect_channel_tap_connect_channel"), {
        reply_markup: { keyboard: connectKeyboard(locale), resize_keyboard: true },
      });
      return;
    }
    await ctx.reply(tc(locale, "tg.bot.reply_notification_answer_open_dashboard"), {
      reply_markup: {
        inline_keyboard: [[open(tc(locale, "tg.bot.open_dashboard"), "/dashboard")]],
      },
    });
  });

  return bot;
}

async function replyInConversation(ctx: Context, userId: string, conversationId: string, text: string) {
  const locale = lang(ctx);
  try {
    const { role } = await conversationAccess(conversationId, userId);
    await sendMessage({ conversationId, userId, role, body: text, via: "telegram" });
    await ctx.reply(tc(locale, "tg.bot.sent"), {
      reply_parameters: { message_id: ctx.message!.message_id },
    });
  } catch (err) {
    log.warn("telegram chat reply failed", { err });
    await ctx.reply(tc(locale, "tg.bot.couldn_t_send_reply_open"));
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

