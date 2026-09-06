import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import {
  issueConnectCode,
  listChannelsForOwner,
  serializeChannel,
} from "@/lib/channels";
import { serverEnv } from "@/lib/env.server";
import { telegramBotUsername } from "@/lib/env";

const bodySchema = z.object({
  shopId: z.string().uuid(),
});

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

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = bodySchema.parse(await request.json());
    const { code, expiresAt, shop } = await issueConnectCode(
      body.shopId,
      session.userId,
    );

    const bot =
      serverEnv.TELEGRAM_BOT_USERNAME || telegramBotUsername || "YourBot";

    return jsonOk({
      code,
      expiresAt: expiresAt.toISOString(),
      shopId: shop.id,
      shopSlug: shop.slug,
      instructions: [
        `Add @${bot.replace(/^@/, "")} to your channel as admin (post messages).`,
        `Post this code in the channel: ${code}`,
        "Postify will reply when the channel is linked.",
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
