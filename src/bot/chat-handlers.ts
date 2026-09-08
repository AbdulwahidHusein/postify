import "server-only";

import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatReplyContexts, conversations } from "@/db/schema";
import {
  findConversationByTelegramReply,
  getUserByTelegramId,
  sendMessageAndNotify,
} from "@/lib/chat";
import {
  callbackToConversationId,
  findConversationIdByStartPayload,
} from "@/lib/chat/telegram-bridge";
import { serverEnv } from "@/lib/env.server";

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

async function setReplyContext(telegramUserId: bigint, conversationId: string) {
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db
    .insert(chatReplyContexts)
    .values({
      telegramUserId,
      conversationId,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: chatReplyContexts.telegramUserId,
      set: {
        conversationId,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

async function takeReplyContext(telegramUserId: bigint) {
  const row = await db.query.chatReplyContexts.findFirst({
    where: eq(chatReplyContexts.telegramUserId, telegramUserId),
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .delete(chatReplyContexts)
      .where(eq(chatReplyContexts.telegramUserId, telegramUserId));
    return null;
  }
  return row.conversationId;
}

export function registerChatBotHandlers(bot: Bot) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const conversationId = callbackToConversationId(data);
    if (!conversationId || !ctx.from) {
      return;
    }

    const user = await getUserByTelegramId(BigInt(ctx.from.id));
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { shop: true },
    });
    if (!conversation || !user || conversation.shop.ownerUserId !== user.id) {
      await ctx.answerCallbackQuery({
        text: "Not your conversation",
        show_alert: true,
      });
      return;
    }

    await setReplyContext(BigInt(ctx.from.id), conversationId);
    await ctx.answerCallbackQuery({ text: "Reply with your next message" });
    await ctx.reply("Send your next message as the reply.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open inbox",
              url: `${appUrl()}/dashboard/s/${conversation.shop.slug}/inbox/${conversationId}`,
            },
          ],
        ],
      },
    });
  });

  bot.on("message:text", async (ctx, next) => {
    const chat = ctx.chat;
    const from = ctx.from;
    const text = ctx.message.text?.trim();
    if (!chat || chat.type !== "private" || !from || !text) {
      return next();
    }

    // Let /commands fall through — grammY command handlers run first usually,
    // but message:text still fires. Skip slash commands.
    if (text.startsWith("/")) return next();

    const telegramUserId = BigInt(from.id);
    let conversationId: string | null = null;

    const replyTo = ctx.message.reply_to_message;
    if (replyTo) {
      const found = await findConversationByTelegramReply({
        telegramChatId: telegramUserId,
        telegramMessageId: replyTo.message_id,
      });
      conversationId = found?.id ?? null;
    }

    if (!conversationId) {
      conversationId = await takeReplyContext(telegramUserId);
    }

    if (!conversationId) {
      // Not a chat reply — ignore so other handlers / quiet default.
      return next();
    }

    const user = await getUserByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply("Open Postify once and sign in, then try again.");
      return;
    }

    try {
      await sendMessageAndNotify({
        conversationId,
        userId: user.id,
        body: text,
      });
      await db
        .delete(chatReplyContexts)
        .where(eq(chatReplyContexts.telegramUserId, telegramUserId));
      await ctx.reply("Sent.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send";
      await ctx.reply(msg);
    }
  });
}

export async function handleChatStartPayload(
  payload: string,
): Promise<{ kind: "conversation"; id: string } | null> {
  const id = await findConversationIdByStartPayload(payload);
  if (!id) return null;
  return { kind: "conversation", id };
}
