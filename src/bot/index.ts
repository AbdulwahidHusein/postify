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
import { enqueueIngestChannelPost } from "@/lib/ingest-channel-post";
import { pickBestPhotoFileId } from "@/lib/products";
import { syncShopLogoFromTelegramChat } from "@/lib/shop-logo";
import {
  extractListingPhotos,
  isAuthorizedGroupPoster,
  isGroupChatType,
  isLinkableChatType,
  listingCaptionFromMessage,
} from "@/lib/telegram-source";
import { db } from "@/db";
import { channels, shops, type Channel } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  handleChatStartPayload,
  registerChatBotHandlers,
} from "@/bot/chat-handlers";

export type BotContext = Context;

const globalForBot = globalThis as unknown as {
  postifyBotV14?: Bot;
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
  opts?: { channelReply?: boolean; chatType?: string },
) {
  const openDash = {
    inline_keyboard: [
      [
        {
          text: "Open Goods",
          web_app: { url: `${appUrl()}/dashboard` },
        },
      ],
    ],
  };

  if (result.status === "no_account") {
    await ctx.reply("Open Goods once, then add the bot again.", {
      reply_markup: openDash,
    });
    return;
  }
  if (result.status === "conflict") {
    await ctx.reply("This chat is already linked to another shop.");
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

  const isGroup = isGroupChatType(opts?.chatType ?? result.channel.chatType);
  const msg = opts?.channelReply
    ? isGroup
      ? `Connected · ${result.shop.name}\nOnly admin posts become products.`
      : `Connected · ${result.shop.name}\nPost a photo with a price.`
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

async function enqueueListingPost(input: {
  channel: Channel;
  chatId: bigint;
  messageId: number;
  mediaGroupId: string | null;
  caption: string;
  photos: { fileId: string }[];
  isEdit?: boolean;
}) {
  await touchChannelPost(input.channel.id, input.messageId);
  await enqueueIngestChannelPost({
    channelId: input.channel.id,
    chatId: input.chatId,
    messageId: input.messageId,
    mediaGroupId: input.mediaGroupId,
    caption: input.caption,
    photos: input.photos,
    isEdit: input.isEdit,
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
      [
        "I turn your Telegram channel or group into a shop.",
        "",
        `Add @${botUsername()} to your channel (subscriber) or group (as admin).`,
        "In groups, only admin posts become products.",
        "Then post a photo with a price.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Open Goods",
                web_app: { url: `${appUrl()}/dashboard` },
              },
            ],
          ],
        },
      },
    );
  });

  // Connect by forwarding a channel/group post to the bot (private chat).
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    const from = ctx.from;
    if (!msg || !from || ctx.chat?.type !== "private") return next();

    const raw = msg as {
      forward_from_chat?: {
        type?: string;
        id: number;
        title?: string;
        username?: string;
      };
      forward_origin?: {
        type?: string;
        chat?: {
          type?: string;
          id: number;
          title?: string;
          username?: string;
        };
      };
    };
    const fwdChat =
      raw.forward_from_chat && isLinkableChatType(raw.forward_from_chat.type)
        ? raw.forward_from_chat
        : raw.forward_origin?.type === "channel" &&
            raw.forward_origin.chat &&
            isLinkableChatType(raw.forward_origin.chat.type)
          ? raw.forward_origin.chat
          : raw.forward_origin?.type === "chat" &&
              raw.forward_origin.chat &&
              isLinkableChatType(raw.forward_origin.chat.type)
            ? raw.forward_origin.chat
            : null;

    if (!fwdChat || !isLinkableChatType(fwdChat.type)) return next();

    try {
      const result = await linkChannelForTelegramUser({
        telegramUserId: BigInt(from.id),
        telegramChatId: BigInt(fwdChat.id),
        title: fwdChat.title,
        username: fwdChat.username,
        chatType: fwdChat.type,
      });
      await applyLinkResult(ctx, result, { chatType: fwdChat.type });
    } catch (error) {
      console.error("[bot] forward link failed", error);
      await ctx.reply("Could not link. Try again.");
    }
  });

  registerChatBotHandlers(bot);

  // Group/supergroup listing posts (admin-only).
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    const chat = ctx.chat;
    if (!msg || !chat || !isGroupChatType(chat.type)) return next();

    const chatId = BigInt(chat.id);
    const channel = await getChannelByTelegramChatId(chatId);
    if (!channel || channel.status !== "connected") return next();

    const me = await ctx.api.getMe();
    if (msg.from?.id === me.id || msg.from?.is_bot) {
      await touchChannelPost(channel.id, msg.message_id);
      return;
    }

    const allowed = await isAuthorizedGroupPoster(ctx.api, chatId, msg);
    if (!allowed) return;

    const caption = listingCaptionFromMessage(msg);
    const photos = extractListingPhotos(msg, pickBestPhotoFileId);
    // Ignore empty chatter (no caption and no photo)
    if (!caption && photos.length === 0) return;

    try {
      await enqueueListingPost({
        channel,
        chatId,
        messageId: msg.message_id,
        mediaGroupId: msg.media_group_id ?? null,
        caption,
        photos,
      });
    } catch (error) {
      console.error("[bot] group ingest enqueue failed", error);
    }
  });

  bot.on("edited_message", async (ctx) => {
    const msg = ctx.editedMessage;
    const chat = ctx.chat;
    if (!msg || !chat || !isGroupChatType(chat.type)) return;

    const chatId = BigInt(chat.id);
    const channel = await getChannelByTelegramChatId(chatId);
    if (!channel || channel.status !== "connected") return;

    const me = await ctx.api.getMe();
    if (msg.from?.id === me.id || msg.from?.is_bot) return;

    const allowed = await isAuthorizedGroupPoster(ctx.api, chatId, msg);
    if (!allowed) return;

    const caption = listingCaptionFromMessage(msg);
    const photos = extractListingPhotos(msg, pickBestPhotoFileId);

    try {
      await enqueueListingPost({
        channel,
        chatId,
        messageId: msg.message_id,
        mediaGroupId: msg.media_group_id ?? null,
        caption,
        photos,
        isEdit: true,
      });
    } catch (error) {
      console.error("[bot] group edit ingest enqueue failed", error);
    }
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Add the bot to your channel (subscriber) or group (admin).",
        "Or forward a channel/group post here.",
        "In groups, only admin posts become products.",
        "Then post a photo with a price.",
        "",
        "/start — open Goods",
        "/status — check this chat",
      ].join("\n"),
    );
  });

  bot.command("status", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;

    if (!isLinkableChatType(chat.type)) {
      await ctx.reply("Run /status inside your connected channel or group.");
      return;
    }

    const channel = await getChannelByTelegramChatId(BigInt(chat.id));
    if (!channel) {
      await ctx.reply(
        isGroupChatType(chat.type)
          ? "Not connected yet. Add the bot as a group admin."
          : "Not connected yet. Add the bot as a channel subscriber.",
      );
      return;
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, channel.shopId),
    });

    const kind = isGroupChatType(channel.chatType) ? "group" : "channel";
    await ctx.reply(
      `Connected · ${shop?.name ?? "shop"} (${kind})${
        kind === "group" ? "\nOnly admin posts become products." : ""
      }`,
    );
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

    if (!isLinkableChatType(chat.type)) return;

    if (status === "kicked" || status === "left" || status === "restricted") {
      try {
        await db
          .update(channels)
          .set({ status: "disconnected", updatedAt: new Date() })
          .where(eq(channels.telegramChatId, BigInt(chat.id)));
        console.info("[bot] source disconnected", {
          chat: chatFingerprint(chat.id),
          status,
          type: chat.type,
        });
      } catch (error) {
        console.error("[bot] disconnect update failed", error);
      }
      return;
    }

    // Channels: member or admin is enough. Groups: must be admin to see posts.
    if (isGroupChatType(chat.type)) {
      if (status !== "administrator") return;
    } else if (status !== "administrator" && status !== "member") {
      return;
    }
    if (!from || from.is_bot) return;

    try {
      const result = await linkChannelForTelegramUser({
        telegramUserId: BigInt(from.id),
        telegramChatId: BigInt(chat.id),
        title: "title" in chat ? chat.title : null,
        username: "username" in chat ? chat.username : null,
        chatType: chat.type,
      });
      await applyLinkResult(ctx, result, {
        channelReply: true,
        chatType: chat.type,
      });
      console.info("[bot] source link", {
        status: result.status,
        chat: chatFingerprint(chat.id),
        type: chat.type,
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
    if (!channel) return;

    const me = await ctx.api.getMe();
    if (post.from?.id === me.id || post.from?.is_bot) {
      await touchChannelPost(channel.id, post.message_id);
      return;
    }

    const caption = listingCaptionFromMessage(post);
    const photos = extractListingPhotos(post, pickBestPhotoFileId);

    try {
      await enqueueListingPost({
        channel,
        chatId,
        messageId: post.message_id,
        mediaGroupId: post.media_group_id ?? null,
        caption,
        photos,
      });
    } catch (error) {
      console.error("[bot] ingest enqueue failed", error);
    }
  });

  bot.on("edited_channel_post", async (ctx) => {
    const post = ctx.editedChannelPost;
    if (!post) return;

    const chatId = BigInt(post.chat.id);
    const channel = await getChannelByTelegramChatId(chatId);
    if (!channel) return;

    const me = await ctx.api.getMe();
    if (post.from?.id === me.id || post.from?.is_bot) return;

    const caption = listingCaptionFromMessage(post);
    const photos = extractListingPhotos(post, pickBestPhotoFileId);

    try {
      await enqueueListingPost({
        channel,
        chatId,
        messageId: post.message_id,
        mediaGroupId: post.media_group_id ?? null,
        caption,
        photos,
        isEdit: true,
      });
    } catch (error) {
      console.error("[bot] edit ingest enqueue failed", error);
    }
  });

  return bot;
}

export function getBot(): Bot {
  if (!serverEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!globalForBot.postifyBotV14) {
    globalForBot.postifyBotV14 = buildBot();
  }
  return globalForBot.postifyBotV14;
}
