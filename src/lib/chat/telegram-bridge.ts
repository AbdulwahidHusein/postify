import "server-only";

import { eq } from "drizzle-orm";
import { Api, InputFile } from "grammy";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { conversations, messageDeliveries, messages } from "@/db/schema";
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
      return `${appUrl()}${imageUrl}`;
    }
  }
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${appUrl()}${imageUrl}`;
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
  if (!conversation?.shop?.owner || !conversation.product) return;

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

  const productImage =
    message.kind === "image" && message.imageUrl
      ? message.imageUrl
      : product.images?.[0]
        ? productImageSrc(product.images[0])
        : null;
  const photo = await resolveLocalPhoto(productImage);

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

    const sent = photo
      ? await bot.sendPhoto(Number(ownerTg), photo, {
          caption,
          reply_markup: keyboard,
        })
      : await bot.sendMessage(Number(ownerTg), caption, {
          reply_markup: keyboard,
        });

    await recordDelivery({
      messageId: message.id,
      channel: "telegram_seller",
      telegramChatId: ownerTg,
      telegramMessageId: sent.message_id,
    });
    return;
  }

  const buyerTg = conversation.buyer?.telegramId;
  if (!buyerTg) return;

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

  const sent = photo
    ? await bot.sendPhoto(Number(buyerTg), photo, {
        caption,
        reply_markup: keyboard,
      })
    : await bot.sendMessage(Number(buyerTg), caption, {
        reply_markup: keyboard,
      });

  await recordDelivery({
    messageId: message.id,
    channel: "telegram_buyer",
    telegramChatId: buyerTg,
    telegramMessageId: sent.message_id,
  });
}
