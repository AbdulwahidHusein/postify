import { NextResponse } from "next/server";
import { flushOutbox, reclaimStaleOutbox } from "@/lib/chat/outbox";
import { serverEnv } from "@/lib/env.server";

/**
 * Flush pending Telegram notifications (chat + orders).
 * Protect with CRON_SECRET header, or TELEGRAM_WEBHOOK_SECRET as fallback.
 *
 * curl -X POST "$APP_URL/api/cron/outbox" -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  const secret =
    process.env.CRON_SECRET || serverEnv.TELEGRAM_WEBHOOK_SECRET || "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";

  if (!secret || (bearer !== secret && headerSecret !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reclaimStaleOutbox();
  const processed = await flushOutbox(40);
  return NextResponse.json({ ok: true, processed });
}

export async function GET(request: Request) {
  return POST(request);
}
