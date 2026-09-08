import "server-only";

import { eq } from "drizzle-orm";
import { Api, InputFile } from "grammy";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { conversations, messageDeliveries, messages, orders } from "@/db/schema";
import { requireBotToken, serverEnv } from "@/lib/env.server";
import { formatPrice, productImageSrc } from "@/lib/products";
import { resolveUploadPath } from "@/lib/storage";

function appUrl() {
  return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

function telegramApi() {
  return new Api(requireBotToken());
}

export function conversationIdToCallback(conversationId: string) {
  return `cr:${conversationId.replace(/-/g, "")}`;
}

export function callbackToConversationId(data: string): string | null {
  if (!data.startsWith("cr:") || data.length !== 3 + 32) return null;
  const hex = data.slice(3);
  if (!/^[a-f0-9]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function findConversationIdByStartPayload(
  payload: string,
): Promise<string | null> {
  const m = /^c_([a-f0-9]{8,32})$/i.exec(payload.trim());
  if (!m) return null;
  const clean = m[1].toLowerCase();
  const { sql } = await import("drizzle-orm");
  const result = await db.execute(
    sql`select id::text as id from conversations where replace(id::text, '-', '') like ${`${clean}%`} limit 1`,
  );
  const rows = (
    Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? [])
  ) as { id: string }[];
  const id = rows[0]?.id;
  return typeof id === "string" ? id : null;
}

async function recordDelivery(input: {
  messageId: string;
  channel: "telegram_seller" | "telegram_buyer";
  telegramChatId: bigint;
  telegramMessageId: number;
}) {
  await db
    .insert(messageDeliveries)
    .values({
      messageId: input.messageId,
      channel: input.channel,
      telegramChatId: input.telegramChatId,
      telegramMessageId: input.telegramMessageId,
    })
    .onConflictDoNothing();
}

async function resolveLocalPhoto(
  imageUrl: string | null | undefined,
): Promise<InputFile | string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/api/media/file/")) {
    const key = imageUrl.replace("/api/media/file/", "");
    try {
      const abs = resolveUploadPath(key);
      const buf = await readFile(abs);
      return new InputFile(buf, path.basename(abs));
    } catch {
      return null;
    }
  }
  // Relative /api/media/telegram/... or tunnel HTTPS URLs often fail when
  // Telegram's servers try to fetch them — prefer uploading bytes or file_id.
  if (imageUrl.startsWith("/api/media/") || imageUrl.startsWith("http")) {
    return null;
  }
  return null;
}

/** Prefer Telegram file_id (re-sendable), then local upload bytes. */
async function resolveTelegramPhoto(image: {
  url?: string | null;
  telegramFileId?: string | null;
} | null | undefined): Promise<InputFile | string | null> {
  if (!image) return null;
  if (image.telegramFileId) return image.telegramFileId;
  return resolveLocalPhoto(productImageSrc(image));
}

async function sendPhotoOrText(
  bot: Api,
  chatId: number,
  photo: InputFile | string | null,
  caption: string,
  reply_markup: {
    inline_keyboard: { text: string; url?: string; callback_data?: string }[][];
  },
) {
  if (photo) {
    try {
      return await bot.sendPhoto(chatId, photo, { caption, reply_markup });
    } catch (err) {
      console.warn("[telegram] sendPhoto failed, falling back to text", err);
    }
  }
  return bot.sendMessage(chatId, caption, { reply_markup });
}

export async function deliverChatNotification(input: {
  kind: "seller_new_message" | "buyer_new_message";
  payload: { messageId: string; conversationId: string };
}) {
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, input.payload.messageId),
  });
  if (!message || message.senderRole === "system" || message.kind === "product") {
    return;
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, input.payload.conversationId),
    with: {
      shop: { with: { owner: true } },
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      buyer: true,
    },
  });
  if (!conversation?.shop?.owner || !conversation.product) {
    throw new Error("conversation missing shop owner or product");
  }

  const bot = telegramApi();
  const product = conversation.product;
  const price = formatPrice(product) ?? product.currency;
  const productUrl = `${appUrl()}/p/${product.slug}`;
  const desc = product.description?.trim();
  const descLine = desc
    ? desc.length > 160
      ? `${desc.slice(0, 157)}…`
      : desc
    : null;
  const quote = message.body.trim()
    ? message.body.length > 400
      ? `${message.body.slice(0, 397)}…`
      : message.body
    : message.imageUrl
      ? "Sent a photo"
      : "";

  const photo =
    message.kind === "image" && message.imageUrl
      ? await resolveLocalPhoto(message.imageUrl)
      : await resolveTelegramPhoto(product.images?.[0]);

  if (input.kind === "seller_new_message") {
    const ownerTg = conversation.shop.owner.telegramId;
    const inboxUrl = `${appUrl()}/dashboard/s/${conversation.shop.slug}/inbox/${conversation.id}`;
    const buyerLabel = conversation.buyer
      ? `${conversation.buyer.firstName}${
          conversation.buyer.username ? ` (@${conversation.buyer.username})` : ""
        }`
      : "Buyer";

    const caption = [
      `New message · ${conversation.shop.name}`,
      `${product.title} · ${price}`,
      descLine,
      `From ${buyerLabel}`,
      "",
      quote ? `“${quote}”` : null,
      "",
      "Reply to this message, or tap Reply here.",
    ]
      .filter((line) => line != null && line !== "")
      .join("\n")
      .slice(0, 1024);

    const keyboard = {
      inline_keyboard: [
        [
          { text: "Open chat", url: inboxUrl },
          {
            text: "Reply here",
            callback_data: conversationIdToCallback(conversation.id),
          },
        ],
        [{ text: "View product", url: productUrl }],
      ],
    };

    const sent = await sendPhotoOrText(
      bot,
      Number(ownerTg),
      photo,
      caption,
      keyboard,
    );

    await recordDelivery({
      messageId: message.id,
      channel: "telegram_seller",
      telegramChatId: ownerTg,
      telegramMessageId: sent.message_id,
    });
    return;
  }

  const buyerTg = conversation.buyer?.telegramId;
  if (!buyerTg) {
    throw new Error("buyer missing telegram id");
  }

  const chatUrl = `${appUrl()}/inbox/${conversation.id}`;
  const caption = [
    `Reply from ${conversation.shop.name}`,
    `${product.title} · ${price}`,
    descLine,
    "",
    quote ? `“${quote}”` : null,
  ]
    .filter((line) => line != null && line !== "")
    .join("\n")
    .slice(0, 1024);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Open chat", url: chatUrl },
        { text: "View product", url: productUrl },
      ],
    ],
  };

  const sent = await sendPhotoOrText(
    bot,
    Number(buyerTg),
    photo,
    caption,
    keyboard,
  );

  await recordDelivery({
    messageId: message.id,
    channel: "telegram_buyer",
    telegramChatId: buyerTg,
    telegramMessageId: sent.message_id,
  });
}

export async function deliverOrderNotification(input: { orderId: string }) {
  if (!input.orderId) return;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
    with: {
      shop: { with: { owner: true } },
      product: {
        with: {
          images: {
            orderBy: (img, { asc: o }) => [o(img.sortOrder)],
            limit: 1,
          },
        },
      },
      buyer: true,
    },
  });
  if (!order?.shop?.owner || !order.product) {
    throw new Error("order missing shop owner or product");
  }

  const bot = telegramApi();
  const ownerTg = order.shop.owner.telegramId;
  const product = order.product;
  const price =
    order.unitPrice != null
      ? `${order.currency} ${Number(order.unitPrice).toLocaleString()}`
      : formatPrice(product) ?? order.currency;
  const productUrl = `${appUrl()}/p/${product.slug}`;
  const ordersUrl = `${appUrl()}/dashboard/s/${order.shop.slug}/orders`;
  const chatUrl = order.conversationId
    ? `${appUrl()}/dashboard/s/${order.shop.slug}/inbox/${order.conversationId}`
    : ordersUrl;
  const buyerLabel = order.buyer
    ? `${order.buyer.firstName}${
        order.buyer.username ? ` (@${order.buyer.username})` : ""
      }`
    : order.buyerName;

  const caption = [
    `New order · ${order.shop.name}`,
    `${product.title} · qty ${order.quantity} · ${price}`,
    `Buyer: ${buyerLabel}`,
    `Phone: ${order.buyerPhone}`,
    order.notes ? `Notes: ${order.notes}` : null,
    "",
    "Confirm or arrange payment offline.",
  ]
    .filter((line) => line != null && line !== "")
    .join("\n")
    .slice(0, 1024);

  const photo = await resolveTelegramPhoto(product.images?.[0]);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Open orders", url: ordersUrl },
        { text: "Open chat", url: chatUrl },
      ],
      [{ text: "View product", url: productUrl }],
    ],
  };

  await sendPhotoOrText(bot, Number(ownerTg), photo, caption, keyboard);
}
