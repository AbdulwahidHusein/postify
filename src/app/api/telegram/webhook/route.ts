import { handleTelegramWebhook } from "@/server/bot/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
