import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { Message, Update } from "grammy/types";
import { serverEnv } from "@/server/env";
import { log } from "@/server/log";
import { getBot } from "@/server/bot";
import { acceptListingUpdate, isListingCandidate } from "@/server/domain/ingest";
import { getChannelByChatId, isGroupType } from "@/server/domain/channels";

function secretOk(request: Request) {
  const expected = serverEnv.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pick out channel/group posts that may be listings; everything else is interactive. */
function listingMessage(update: Update): { message: Message; isEdit: boolean } | null {
  if (update.channel_post) return { message: update.channel_post, isEdit: false };
  if (update.edited_channel_post) return { message: update.edited_channel_post, isEdit: true };
  const m = update.message ?? update.edited_message;
  if (m && isGroupType(m.chat.type) && !(m.text ?? "").startsWith("/")) {
    return { message: m, isEdit: Boolean(update.edited_message) };
  }
  return null;
}

/**
 * Telegram webhook. Listing posts are stored and queued (no AI, no media work
 * here) so the response goes back in milliseconds. Interactive updates
 * (commands, buttons, private chat) run inline; they are small DB operations.
 */
export async function handleTelegramWebhook(request: Request): Promise<Response> {
  if (!secretOk(request)) return new Response("forbidden", { status: 403 });

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const listing = listingMessage(update);
  if (listing) {
    const channel = await getChannelByChatId(BigInt(listing.message.chat.id));
    if (!channel || channel.status !== "connected") return new Response("ok");
    if (!listing.isEdit && !isListingCandidate(listing.message)) return new Response("ok");
    try {
      await acceptListingUpdate({ updateId: update.update_id, message: listing.message, isEdit: listing.isEdit });
      return new Response("ok");
    } catch (err) {
      // Storage failed (e.g. database down): let Telegram redeliver.
      log.error("failed to store listing update", { update_id: update.update_id, err });
      return new Response("retry", { status: 500 });
    }
  }

  try {
    const bot = await getBot();
    await bot.handleUpdate(update);
  } catch (err) {
    // Interactive handlers already reply to the user on expected failures.
    // Never make Telegram retry a half-handled command.
    log.error("bot update failed", { update_id: update.update_id, err });
  }
  return new Response("ok");
}
