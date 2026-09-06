import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "ZodError"
  ) {
    const zodError = error as { issues?: { message: string }[] };
    const message =
      zodError.issues?.[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const message =
    error instanceof Error ? error.message : "Unexpected server error";

  const status =
    message.includes("not configured") || message.includes("TELEGRAM_BOT_TOKEN")
      ? 503
      : message.toLowerCase().includes("invalid") ||
          message.toLowerCase().includes("expired") ||
          message.toLowerCase().includes("no user")
        ? 401
        : fallbackStatus;

  return NextResponse.json({ error: message }, { status });
}
