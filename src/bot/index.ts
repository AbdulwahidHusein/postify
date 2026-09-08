import "server-only";

import { Bot, type Context } from "grammy";
import { requireBotToken, serverEnv } from "@/lib/env.server";
import { createLoginTokenForIdentity, redirectPathFromStartPayload } from "@/lib/auth/login-tokens";
import {
  chatFingerprint,
  connectChannelToShop,
  extractConnectCode,
  findShopByConnectCode,
  getChannelByTelegramChatId,
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
  postifyBotV12?: Bot;
};

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

function botUsername() {
  return serverEnv.TELEGRAM_BOT_USERNAME.replace(/^@/, "") || "this bot";
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
          ? "Tap below to finish signing in — you’ll return to message the seller."
          : "Tap below to finish signing in on the website. This link works once and expires in 10 minutes.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: forMessage
                    ? "Confirm & open chat"
                    : "Confirm login on website",
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
        await ctx.reply("Open your chat in Postify:", {
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
      [
        "Welcome to Postify.",
        "",
        "I turn your channel product posts into a shop.",
        "",
        "Setup:",
        "1) Tap Open dashboard",
        "2) Create a shop → Connect channel",
        `3) Add @${botUsername()} as channel admin`,
        "4) Post the PFY code, then post products (photo + caption)",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Open dashboard",
                web_app: { url: `${appUrl()}/dashboard` },
              },
            ],
          ],
        },
      },
    );
  });

  registerChatBotHandlers(bot);

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Commands:",
        "/start — open dashboard",
        "/help — this message",
        "/status — check if a channel is linked",
        "",
        "After connecting: post a product photo + caption (include price).",
        "I’ll reply with an Open in shop link.",
      ].join("\n"),
    );
  });

  bot.command("status", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;

    if (chat.type !== "channel") {
      await ctx.reply("Run /status as a post inside your connected channel.");
      return;
    }

    const channel = await getChannelByTelegramChatId(BigInt(chat.id));
    if (!channel) {
      await ctx.reply("This channel is not connected to Postify yet.");
      return;
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, channel.shopId),
    });

    await ctx.reply(
      [
        "Connected ✓",
        `Shop: ${shop?.name ?? channel.shopId}`,
        shop ? `Dashboard: ${appUrl()}/dashboard/s/${shop.slug}` : "",
        `Last activity: ${channel.lastPostAt?.toLocaleString() ?? "none yet"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const status = ctx.myChatMember.new_chat_member.status;
    console.info("[bot] my_chat_member", {
      chat: chatFingerprint(chat.id),
      type: chat.type,
      status,
    });
  });

  bot.on("channel_post", async (ctx) => {
    const post = ctx.channelPost;
    if (!post) return;

    const chatId = BigInt(post.chat.id);
    const text = (post.text ?? post.caption ?? "").trim();

    const code = text ? extractConnectCode(text) : null;
    if (code) {
      const shop = await findShopByConnectCode(code);
      if (!shop) {
        await ctx.reply(
          "That connect code is invalid or expired. Generate a new one in the Postify dashboard.",
        );
        return;
      }

      try {
        const channel = await connectChannelToShop({
          shopId: shop.id,
          telegramChatId: chatId,
          title: post.chat.title,
          username: post.chat.username,
        });
        try {
          await syncShopLogoFromTelegramChat({
            shop,
            telegramChatId: chatId,
            channelUsername: post.chat.username,
          });
        } catch (logoError) {
          console.warn("[bot] channel logo sync failed", logoError);
        }
        await ctx.reply(
          `Connected to ${shop.name} ✓\nNow post a product (photo + caption with price). I’ll reply with a shop link.`,
        );
        console.info("[bot] channel connected", {
          shopId: shop.id,
          channelId: channel.id,
          chat: chatFingerprint(chatId),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not connect channel";
        await ctx.reply(message);
      }
      return;
    }

    const channel = await getChannelByTelegramChatId(chatId);
    if (!channel) {
      return;
    }

    // Bot-authored posts already include Open in shop — never reply or re-ingest.
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
      // Telegram forbids empty message text. U+2800 (Braille blank) is the usual
      // workaround so clients show essentially only the inline button.
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
        onSkipped: async () => {
          // Stay quiet on non-product posts.
        },
      });
    } catch (error) {
      console.error("[bot] ingest failed", error);
      try {
        await ctx.reply(
          "Could not create the product listing. Try again or add it manually in the dashboard.",
        );
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

  if (!globalForBot.postifyBotV12) {
    globalForBot.postifyBotV12 = buildBot();
  }
  return globalForBot.postifyBotV12;
}
