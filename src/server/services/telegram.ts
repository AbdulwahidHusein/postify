import "server-only";

import { Api, GrammyError, HttpError } from "grammy";
import { appUrl, botUsername, requireBotToken, serverEnv } from "@/server/env";

let api: Api | null = null;

/** Shared Bot API client. Tests replace it with setTelegramApi(). */
export function tg(): Api {
  if (!api) api = new Api(requireBotToken());
  return api;
}

export function setTelegramApi(next: Api | null) {
  api = next;
}

export type TelegramErrorKind =
  | "not_modified"
  | "message_not_found"
  | "cant_edit"
  | "no_rights"
  | "blocked"
  | "chat_not_found"
  | "rate_limited"
  | "bad_request"
  | "transient";

export type ClassifiedError = {
  kind: TelegramErrorKind;
  retryAfter?: number;
  description: string;
};

/** Map Bot API failures onto the handful of cases our code acts on. */
export function classifyTelegramError(error: unknown): ClassifiedError {
  if (error instanceof GrammyError) {
    const d = error.description.toLowerCase();
    if (error.error_code === 429) {
      return {
        kind: "rate_limited",
        retryAfter: error.parameters?.retry_after ?? 5,
        description: error.description,
      };
    }
    if (d.includes("message is not modified")) return { kind: "not_modified", description: error.description };
    if (
      d.includes("message to edit not found") ||
      d.includes("message to delete not found") ||
      d.includes("message_id_invalid") ||
      d.includes("message to be replied not found")
    ) {
      return { kind: "message_not_found", description: error.description };
    }
    if (d.includes("chat not found")) return { kind: "chat_not_found", description: error.description };
    if (
      d.includes("bot was blocked") ||
      d.includes("user is deactivated") ||
      d.includes("bot can't initiate conversation") ||
      d.includes("bot was kicked")
    ) {
      return { kind: "blocked", description: error.description };
    }
    if (
      error.error_code === 403 ||
      d.includes("not enough rights") ||
      d.includes("have no rights") ||
      d.includes("chat_admin_required")
    ) {
      return { kind: "no_rights", description: error.description };
    }
    if (d.includes("message can't be edited") || d.includes("there is no reply markup")) {
      return { kind: "cant_edit", description: error.description };
    }
    if (error.error_code >= 500) return { kind: "transient", description: error.description };
    return { kind: "bad_request", description: error.description };
  }
  if (error instanceof HttpError) return { kind: "transient", description: error.message };
  return { kind: "transient", description: error instanceof Error ? error.message : String(error) };
}

/** Thrown inside jobs so the task runner returns a retryable status. */
export class RetryLater extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 10) {
    super(message);
    this.name = "RetryLater";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Link that opens the Mini App with a start parameter. Telegram allows
 * [A-Za-z0-9_-] up to 512 chars. Falls back to a web URL when no Mini App
 * short name is configured.
 */
export function miniAppLink(startParam: string, webPath: string): string {
  const short = serverEnv.TELEGRAM_MINI_APP_SHORT_NAME;
  const bot = botUsername();
  if (short && bot && /^[A-Za-z0-9_-]{1,512}$/.test(startParam)) {
    return `https://t.me/${bot}/${short}?startapp=${startParam}`;
  }
  return `${appUrl()}${webPath}`;
}

/** Deep link into the bot's private chat with a /start payload. */
export function botStartLink(payload: string): string {
  return `https://t.me/${botUsername()}?start=${payload}`;
}

/** One-tap link that re-adds the bot to a channel with the rights we need. */
export function channelRightsLink(): string {
  return `https://t.me/${botUsername()}?startchannel&admin=post_messages+edit_messages`;
}

export function groupRightsLink(): string {
  return `https://t.me/${botUsername()}?startgroup&admin=pin_messages`;
}

/** Public t.me link to a channel post, when the channel is public. */
export function postLink(input: {
  username?: string | null;
  chatId: bigint;
  messageId: number;
}): string | null {
  if (input.username) return `https://t.me/${input.username}/${input.messageId}`;
  const s = input.chatId.toString();
  if (s.startsWith("-100")) return `https://t.me/c/${s.slice(4)}/${input.messageId}`;
  return null;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
