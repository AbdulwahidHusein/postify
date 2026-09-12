import { webhookCallback } from "grammy";
import { NextResponse } from "next/server";
import { getBot } from "@/bot";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createHandler() {
  const bot = getBot();
  return webhookCallback(bot, "std/http", {
    secretToken: serverEnv.TELEGRAM_WEBHOOK_SECRET,
    timeoutMilliseconds: 9_000,
  });
}

export async function POST(request: Request) {
  try {
    if (!serverEnv.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is not configured" },
        { status: 503 },
      );
    }
    // Without the secret token, grammY skips header verification and the
    // webhook is unauthenticated — anyone can POST forged channel_post /
    // my_chat_member updates. Refuse rather than run insecure.
    if (!serverEnv.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "TELEGRAM_WEBHOOK_SECRET is not configured" },
        { status: 503 },
      );
    }

    const handleUpdate = createHandler();
    const response = await handleUpdate(request);

    // Opportunistic outbox drain: chat/order Telegram deliveries (fast) and
    // channel-post ingest jobs (LLM). Both run after the response is sent, so
    // the webhook still ACKs immediately; the cron is the reliable fallback.
    void import("@/lib/chat/outbox")
      .then(async ({ reclaimStaleOutbox, flushOutbox }) => {
        await reclaimStaleOutbox();
        await flushOutbox(12);
      })
      .catch((err) => console.warn("[bot] outbox flush", err));
    void import("@/lib/ingest-channel-post")
      .then(async ({ flushIngestOutbox }) => {
        await flushIngestOutbox(4);
      })
      .catch((err) => console.warn("[bot] ingest flush", err));

    return response;
  } catch (error) {
    console.error("[bot webhook]", error);
    const message =
      error instanceof Error ? error.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    botConfigured: Boolean(serverEnv.TELEGRAM_BOT_TOKEN),
    webhookSecretConfigured: Boolean(serverEnv.TELEGRAM_WEBHOOK_SECRET),
  });
}
