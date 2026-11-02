import "server-only";

import { and, eq } from "drizzle-orm";
import { InputFile } from "grammy";
import { db } from "@/server/db";
import { channels, productSources, type Shop } from "@/server/db/schema";
import { AppError, notFound } from "@/server/http";
import { shortCode } from "@/server/ids";
import { getObject, renditionKey } from "@/server/services/storage";
import { classifyTelegramError, tg } from "@/server/services/telegram";
import { getProductBundle } from "@/server/domain/products";
import { desiredHash, renderCardText, renderKeyboard, toButtonProduct } from "@/server/domain/buttons";
import { normalizeSettings } from "@/server/domain/shops";
import { formatMoney } from "@/lib/money";

function caption(title: string, price: string | null, description: string | null) {
  const body = description ? `\n\n${description.slice(0, 700)}${description.length > 700 ? "…" : ""}` : "";
  return `${title}${price ? `\n${price}` : ""}${body}`.slice(0, 1024);
}

/**
 * The bot publishes a product to a linked channel or group itself. Because the
 * bot owns the message, its buttons can always be edited later.
 */
export async function publishToChannel(shop: Shop, productId: string, channelId: string) {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.shopId, shop.id)),
  });
  if (!channel || channel.status !== "connected") throw notFound("Channel not connected");
  if (channel.chatType === "channel" && !channel.canPostMessages) {
    throw new AppError("Give the bot the “Post messages” right in this channel first", 409, "no_rights");
  }
  const bundle = await getProductBundle(shop.id, productId);
  if (!bundle) throw notFound("Product not found");
  if (bundle.status !== "published") throw new AppError("Publish the product before posting it", 409);

  const settings = normalizeSettings(shop.settings);
  const code = shortCode(8);
  const bp = toButtonProduct(bundle);
  const keyboard = renderKeyboard({ product: bp, sourceCode: code, shopHandle: shop.handle, lang: settings.buttonLanguage });
  const v = bundle.variants[0];
  const text = caption(bundle.title, v?.priceMinor != null ? formatMoney(v.priceMinor, v.currency) : null, bundle.description);
  const markup = keyboard ? { inline_keyboard: keyboard } : undefined;
  const chat = Number(channel.telegramChatId);

  const cover = bundle.images.find((i) => i.status === "ready" || i.telegramFileId);
  let messageId: number;
  try {
    if (cover?.telegramFileId) {
      messageId = (await tg().sendPhoto(chat, cover.telegramFileId, { caption: text, reply_markup: markup })).message_id;
    } else if (cover?.storageKey) {
      const bytes = await getObject(renditionKey(cover.storageKey, 1600), "public");
      messageId = (
        await tg().sendPhoto(chat, new InputFile(bytes, "photo.webp"), { caption: text, reply_markup: markup })
      ).message_id;
    } else {
      messageId = (await tg().sendMessage(chat, text, { reply_markup: markup })).message_id;
    }
  } catch (err) {
    const c = classifyTelegramError(err);
    throw new AppError(`Telegram refused the post: ${c.description}`, 502, "telegram_error");
  }

  const hash = desiredHash("bot_post", keyboard, renderCardText(bp, settings.buttonLanguage));
  const [source] = await db
    .insert(productSources)
    .values({
      code,
      productId: bundle.id,
      shopId: shop.id,
      channelId: channel.id,
      chatId: channel.telegramChatId,
      messageId,
      messageIds: [messageId],
      buttonMode: "bot_post",
      desiredHash: hash,
      appliedHash: hash,
      buttonStatus: "synced",
      lastSyncedAt: new Date(),
    })
    .returning();
  await db.update(channels).set({ lastPostAt: new Date() }).where(eq(channels.id, channel.id));
  return source;
}
