import { webhookCallback } from "grammy";
import { NextResponse } from "next/server";
import { getBot } from "@/bot";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createHandler() {
  const bot = getBot();
  const secret = serverEnv.TELEGRAM_WEBHOOK_SECRET || undefined;
  return webhookCallback(bot, "std/http", {
    secretToken: secret,
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

    const handleUpdate = createHandler();
    return await handleUpdate(request);
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
