import { NextResponse } from "next/server";
import { flushOutbox, purgeOutbox, reclaimStaleOutbox } from "@/lib/chat/outbox";
import { flushIngestOutbox } from "@/lib/ingest-channel-post";
import { autoArchiveProducts } from "@/lib/products";
import { serverEnv } from "@/lib/env.server";

/**
 * Flush pending Telegram notifications (chat + orders) and channel-post ingest
 * jobs, and purge old terminal rows. Protect with CRON_SECRET header, or
 * TELEGRAM_WEBHOOK_SECRET as fallback.
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
  const notified = await flushOutbox(40);
  const ingested = await flushIngestOutbox(10);
  const archived = await autoArchiveProducts();
  await purgeOutbox();
  return NextResponse.json({ ok: true, notified, ingested, archived });
}

export async function GET(request: Request) {
  return POST(request);
}
