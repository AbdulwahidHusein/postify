import "server-only";

import { Bot, type Context } from "grammy";
import { requireBotToken, serverEnv } from "@/lib/env.server";
import {
  createLoginTokenForIdentity,
  redirectPathFromStartPayload,
} from "@/lib/auth/login-tokens";
import {
  chatFingerprint,
  getChannelByTelegramChatId,
  linkChannelForTelegramUser,
  touchChannelPost,
} from "@/lib/channels";
import { ingestChannelListing } from "@/lib/ingest-channel-post";
import { syncShopLogoFromTelegramChat } from "@/lib/shop-logo";
import { db } from "@/db";
import { shops } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  handleChatStartPayload,
  registerChatBotHandlers,
} from "@/bot/chat-handlers";

export type BotContext = Context;

const globalForBot = globalThis as unknown as {
  postifyBotV13?: Bot;
};

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

function botUsername() {
  return serverEnv.TELEGRAM_BOT_USERNAME.replace(/^@/, "") || "this bot";
}

async function applyLinkResult(
  ctx: Context,
  result: Awaited<ReturnType<typeof linkChannelForTelegramUser>>,
  opts?: { channelReply?: boolean },
) {
  const openDash = {
    inline_keyboard: [
      [
        {
          text: "Open Postify",
          web_app: { url: `${appUrl()}/dashboard` },
        },
      ],
    ],
  };

  if (result.status === "no_account") {
    await ctx.reply("Open Postify once, then add the bot again.", {
      reply_markup: openDash,
    });
    return;
  }
  if (result.status === "conflict") {
    await ctx.reply("This channel is already linked.");
    return;
  }

  try {
    await syncShopLogoFromTelegramChat({
      shop: result.shop,
      telegramChatId: result.channel.telegramChatId,
      channelUsername: result.channel.username,
    });
  } catch (logoError) {
    console.warn("[bot] channel logo sync failed", logoError);
  }

  if (result.status === "already_connected") {
    await ctx.reply(`Already connected · ${result.shop.name}`);
    return;
  }

  const msg = opts?.channelReply
    ? `Connected · ${result.shop.name}\nPost a photo with a price.`
    : `Connected · ${result.shop.name}`;
  await ctx.reply(msg, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open shop",
            web_app: {
              url: `${appUrl()}/dashboard/s/${result.shop.slug}`,
            },
          },
        ],
      ],
    },
  });
}

function buildBot() {
  const bot = new Bot(requireBotToken());

  bot.catch((err) => {
    console.error("[bot] unhandled error", err.error);
  });

  bot.command("start", async (ctx) => {
    const payload = (ctx.match ?? "").toString().trim();
    const from = ctx.from;

    const isAuthPayload =
      payload === "auth" ||
      payload === "auth_inbox" ||
      payload.startsWith("auth_msg_");

    if (isAuthPayload && from) {
      const redirectPath = redirectPathFromStartPayload(payload);
      const { token } = await createLoginTokenForIdentity(
        {
          telegramId: BigInt(from.id),
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
          languageCode: from.language_code,
          isPremium: Boolean(from.is_premium),
          photoUrl: undefined,
        },
        { redirectPath },
      );

      const confirmUrl = `${appUrl()}/auth/telegram?token=${token}`;
      const forMessage = payload.startsWith("auth_msg_");
      await ctx.reply(
        forMessage
          ? "Tap below to sign in and message the seller."
          : "Tap below to sign in.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: forMessage ? "Continue" : "Sign in",
                  url: confirmUrl,
                },
              ],
            ],
          },
        },
      );
      return;
    }

    if (payload.startsWith("c_")) {
      const chatStart = await handleChatStartPayload(payload);
      if (chatStart) {
        await ctx.reply("Open chat:", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Open chat",
                  web_app: { url: `${appUrl()}/inbox/${chatStart.id}` },
                },
              ],
              [
                {
                  text: "Open in browser",
                  url: `${appUrl()}/inbox/${chatStart.id}`,
                },
              ],
            ],
          },
        });
        return;
      }
    }

    await ctx.reply(
      `I turn your channel into an ecommerce platform.\n\nAdd @${botUsername()} as admin to your channel, then post products.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Open Postify",
                web_app: { url: `${appUrl()}/dashboard` },
              },
            ],
          ],
        },
      },
    );
  });

  // Connect by forwarding a channel post to the bot (private chat).
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    const from = ctx.from;
    if (!msg || !from || ctx.chat?.type !== "private") return next();

    const raw = msg as {
      forward_from_chat?: { type?: string; id: number; title?: string; username?: string };
      forward_origin?: {
        type?: string;
        chat?: { type?: string; id: number; title?: string; username?: string };
      };
    };
    const fwdChat =
      raw.forward_from_chat?.type === "channel"
        ? raw.forward_from_chat
        : raw.forward_origin?.type === "channel" && raw.forward_origin.chat
          ? raw.forward_origin.chat
          : null;

    if (!fwdChat) return next();

    try {
      const result = await linkChannelForTelegramUser({
        telegramUserId: BigInt(from.id),
        telegramChatId: BigInt(fwdChat.id),
        title: fwdChat.title,
        username: fwdChat.username,
      });
      await applyLinkResult(ctx, result);
    } catch (error) {
      console.error("[bot] forward link failed", error);
      await ctx.reply("Could not link. Try again.");
    }
  });

  registerChatBotHandlers(bot);

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Add the bot as channel admin.",
        "Or forward a channel post here.",
        "Then post a photo with a price.",
        "",
        "/start — open Postify",
        "/status — check this channel",
      ].join("\n"),
    );
  });

  bot.command("status", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;

    if (chat.type !== "channel") {
      await ctx.reply("Run /status inside your channel.");
      return;
    }

    const channel = await getChannelByTelegramChatId(BigInt(chat.id));
    if (!channel) {
      await ctx.reply("Not connected yet. Add the bot as admin.");
      return;
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, channel.shopId),
    });

    await ctx.reply(`Connected · ${shop?.name ?? "shop"}`);
  });

  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const member = ctx.myChatMember.new_chat_member;
    const status = member.status;
    const from = ctx.from;

    console.info("[bot] my_chat_member", {
      chat: chatFingerprint(chat.id),
      type: chat.type,
      status,
    });

    if (chat.type !== "channel") return;
    if (status !== "administrator" && status !== "member") return;
    if (!from || from.is_bot) return;

    try {
      const result = await linkChannelForTelegramUser({
        telegramUserId: BigInt(from.id),
        telegramChatId: BigInt(chat.id),
        title: "title" in chat ? chat.title : null,
        username: "username" in chat ? chat.username : null,
      });
      await applyLinkResult(ctx, result, { channelReply: true });
      console.info("[bot] channel link", {
        status: result.status,
        chat: chatFingerprint(chat.id),
      });
    } catch (error) {
      console.error("[bot] my_chat_member link failed", error);
    }
  });

  bot.on("channel_post", async (ctx) => {
    const post = ctx.channelPost;
    if (!post) return;

    const chatId = BigInt(post.chat.id);
    const channel = await getChannelByTelegramChatId(chatId);
    if (!channel) {
      return;
    }

    const me = await ctx.api.getMe();
    if (post.from?.id === me.id || post.from?.is_bot) {
      await touchChannelPost(channel.id, post.message_id);
      return;
    }

    await touchChannelPost(channel.id, post.message_id);

    async function replyOpenInShop(productSlug: string) {
      const url = `${appUrl()}/p/${productSlug}`;
      const keyboard = {
        inline_keyboard: [[{ text: "Open in shop", url }]],
      };
      try {
        await ctx.reply("\u2800", { reply_markup: keyboard });
        return;
      } catch (error) {
        console.warn("[bot] braille-blank reply failed, falling back", error);
      }
      await ctx.reply("Open in shop", { reply_markup: keyboard });
    }

    try {
      await ingestChannelListing({
        channel,
        message: post,
        onListed: async (product) => {
          await replyOpenInShop(product.slug);
        },
        onDraft: async (product) => {
          await replyOpenInShop(product.slug);
        },
        onSkipped: async () => {},
      });
    } catch (error) {
      console.error("[bot] ingest failed", error);
      try {
        await ctx.reply("Could not create the listing. Try again.");
      } catch {
        // ignore
      }
    }
  });

  return bot;
}

export function getBot(): Bot {
  if (!serverEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!globalForBot.postifyBotV13) {
    globalForBot.postifyBotV13 = buildBot();
  }
  return globalForBot.postifyBotV13;
}
