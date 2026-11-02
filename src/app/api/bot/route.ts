// Legacy webhook path kept so an existing setWebhook URL keeps working.
import { handleTelegramWebhook } from "@/server/bot/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
