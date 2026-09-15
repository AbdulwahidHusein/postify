import "server-only";

import { readFile } from "node:fs/promises";
import { InputFile } from "grammy";
import { and, eq } from "drizzle-orm";
import { getBot } from "@/bot";
import { db } from "@/db";
import { channels, products } from "@/db/schema";
import { buildProductChannelCaption } from "@/lib/telegram-links";
import { getProductById } from "@/lib/products";
import { serverEnv } from "@/lib/env.server";
import { resolveUploadPath } from "@/lib/storage";

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

async function loadImageInput(image: {
  url: string | null;
  telegramFileId: string | null;
}): Promise<string | InputFile | null> {
  if (image.telegramFileId) return image.telegramFileId;
  if (!image.url) return null;

  // Public R2 / CDN URL — Telegram can fetch it directly.
  if (image.url.startsWith("http://") || image.url.startsWith("https://")) {
    return image.url;
  }

  if (!image.url.startsWith("/api/media/file/")) return null;
  const key = image.url.replace("/api/media/file/", "");
  const abs = resolveUploadPath(key);
  const buffer = await readFile(abs);
  const name = key.split("/").pop() || "photo.jpg";
  return new InputFile(buffer, name);
}

/**
 * Posts a product to the shop's connected channel with an Open in shop button
 * on the message itself (no follow-up reply). Updates source message ids.
 */
export async function postProductToConnectedChannel(productId: string) {
  const product = await getProductById(productId);
  if (!product) throw new Error("Product not found");

  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.shopId, product.shopId),
      eq(channels.status, "connected"),
    ),
  });
  if (!channel) {
    throw new Error("Connect a Telegram channel first");
  }

  const shopUrl = `${appUrl()}/p/${product.slug}`;
  const caption = buildProductChannelCaption({
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency,
  });
  const keyboard = {
    inline_keyboard: [[{ text: "Open in Goods", url: shopUrl }]],
  };

  const bot = getBot();
  // grammY accepts string chat ids — avoid Number() precision loss on large ids
  const chatId = channel.telegramChatId.toString();
  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);

  let messageId: number;

  if (images.length === 0) {
    const sent = await bot.api.sendMessage(chatId, caption || product.title, {
      reply_markup: keyboard,
    });
    messageId = sent.message_id;
  } else if (images.length === 1) {
    const input = await loadImageInput(images[0]!);
    if (!input) {
      const sent = await bot.api.sendMessage(chatId, caption || product.title, {
        reply_markup: keyboard,
      });
      messageId = sent.message_id;
    } else {
      const sent = await bot.api.sendPhoto(chatId, input, {
        caption: caption || undefined,
        reply_markup: keyboard,
      });
      messageId = sent.message_id;
    }
  } else {
    const media: {
      type: "photo";
      media: string | InputFile;
      caption?: string;
    }[] = [];

    for (let i = 0; i < images.length; i++) {
      const input = await loadImageInput(images[i]!);
      if (!input) continue;
      media.push({
        type: "photo",
        media: input,
        ...(i === 0 && caption ? { caption } : {}),
      });
    }

    if (media.length === 0) {
      const sent = await bot.api.sendMessage(chatId, caption || product.title, {
        reply_markup: keyboard,
      });
      messageId = sent.message_id;
    } else if (media.length === 1) {
      const sent = await bot.api.sendPhoto(chatId, media[0]!.media, {
        caption: media[0]!.caption,
        reply_markup: keyboard,
      });
      messageId = sent.message_id;
    } else {
      const sent = await bot.api.sendMediaGroup(chatId, media);
      messageId = sent[0]!.message_id;
      // Media groups can't carry reply_markup at send time, so attach the
      // "Open in Goods" button to the first album message via edit. If that
      // edit is rejected (some channels/album states reject it), fall back to
      // a separate reply message so the button is never missing.
      let buttonAttached = false;
      try {
        await bot.api.editMessageReplyMarkup(chatId, messageId, {
          reply_markup: keyboard,
        });
        buttonAttached = true;
      } catch (error) {
        console.warn("[post-to-channel] editMessageReplyMarkup failed", error);
      }
      if (!buttonAttached) {
        try {
          await bot.api.sendMessage(chatId, "\u2800", {
            reply_to_message_id: messageId,
            reply_markup: keyboard,
          });
        } catch (err) {
          console.warn("[post-to-channel] button reply failed", err);
        }
      }
    }
  }

  await db
    .update(products)
    .set({
      channelId: channel.id,
      sourceChatId: channel.telegramChatId,
      sourceMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  await db
    .update(channels)
    .set({
      lastPostAt: new Date(),
      lastPostMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channel.id));

  return getProductById(productId);
}
