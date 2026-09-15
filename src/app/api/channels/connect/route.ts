import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { listChannelsForOwner, serializeChannel } from "@/lib/channels";
import { serverEnv } from "@/lib/env.server";
import { telegramBotUsername } from "@/lib/env";

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await listChannelsForOwner(session.userId);
    return jsonOk({
      channels: rows.map(serializeChannel),
      botUsername:
        serverEnv.TELEGRAM_BOT_USERNAME || telegramBotUsername || null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Connect codes removed — link via adding the bot as subscriber or forward. */
export async function POST() {
  return jsonOk({
    ok: true,
    method: "add_bot_as_subscriber",
    botUsername: serverEnv.TELEGRAM_BOT_USERNAME || telegramBotUsername || null,
    hint: "Add the bot as a channel subscriber, or forward a channel post to the bot.",
  });
}
