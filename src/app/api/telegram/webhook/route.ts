import { handleTelegramWebhook } from "@/server/bot/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Jobs enqueued by this update run after the response (TASKS_MODE=db).
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
