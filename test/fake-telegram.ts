import { GrammyError, type Api } from "grammy";
import sharp from "sharp";
import { setTelegramApi } from "@/server/services/telegram";

export type Call = { method: string; args: unknown[] };

export function tgError(code: number, description: string, method = "call") {
  return new GrammyError("Call failed", { ok: false, error_code: code, description }, method, {});
}

/**
 * In-memory stand-in for the Bot API methods our server code calls.
 * `failNext` queues an error for the next call of a method.
 */
export class FakeTelegram {
  calls: Call[] = [];
  private nextMessageId = 10_000;
  private failures = new Map<string, Error[]>();
  chatMembers = new Map<string, string>(); // `${chatId}:${userId}` → status
  botRights = { can_post_messages: true, can_edit_messages: true };
  photo: Buffer | null = null;

  failNext(method: string, error: Error) {
    const list = this.failures.get(method) ?? [];
    list.push(error);
    this.failures.set(method, list);
  }

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    const queued = this.failures.get(method);
    if (queued?.length) throw queued.shift()!;
  }

  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method);
  }

  install() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the fake API object needs the recorder
    const self = this;
    const api = {
      async getMe() {
        self.record("getMe", []);
        return { id: 999, is_bot: true, first_name: "Goods", username: "goods_test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };
      },
      async getChatMember(chatId: number, userId: number) {
        self.record("getChatMember", [chatId, userId]);
        if (userId === 999) {
          return { status: "administrator", user: { id: 999 }, ...self.botRights };
        }
        return { status: self.chatMembers.get(`${chatId}:${userId}`) ?? "member", user: { id: userId } };
      },
      async editMessageReplyMarkup(...args: unknown[]) {
        self.record("editMessageReplyMarkup", args);
        return true;
      },
      async editMessageText(...args: unknown[]) {
        self.record("editMessageText", args);
        return true;
      },
      async deleteMessage(...args: unknown[]) {
        self.record("deleteMessage", args);
        return true;
      },
      async sendMessage(chatId: number, text: string, other?: unknown) {
        self.record("sendMessage", [chatId, text, other]);
        return { message_id: self.nextMessageId++, chat: { id: chatId }, date: 0, text };
      },
      async getFile(fileId: string) {
        self.record("getFile", [fileId]);
        return { file_id: fileId, file_unique_id: fileId, file_path: `photos/${fileId}.jpg`, file_size: 1000 };
      },
      async getWebhookInfo() {
        self.record("getWebhookInfo", []);
        return { url: "https://x", has_custom_certificate: false, pending_update_count: 0 };
      },
      async leaveChat(...args: unknown[]) {
        self.record("leaveChat", args);
        return true;
      },
      async getChat(chatId: number) {
        self.record("getChat", [chatId]);
        return { id: chatId, type: "channel", title: "Chat" };
      },
    };
    setTelegramApi(api as unknown as Api);
    return this;
  }

  /** Serve file downloads for media jobs with a real JPEG. */
  async installFileServer() {
    this.photo ??= await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 200, g: 60, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const photo = this.photo;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.telegram.org/file/")) {
        return new Response(new Uint8Array(photo), { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
  }
}
