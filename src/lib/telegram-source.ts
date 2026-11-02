import "server-only";

import type { Api, Context } from "grammy";

export type TelegramChatType = "channel" | "group" | "supergroup";

export function isLinkableChatType(
  type: string | undefined,
): type is TelegramChatType {
  return type === "channel" || type === "group" || type === "supergroup";
}

export function isGroupChatType(type: string | null | undefined): boolean {
  return type === "group" || type === "supergroup";
}

/**
 * For groups/supergroups: only creator/administrator posts become products.
 * Channel posts are always treated as shop content (no per-member filter).
 *
 * Handles anonymous-admin posts where Telegram sets sender_chat to the group.
 */
export async function isAuthorizedGroupPoster(
  api: Api,
  chatId: bigint | number,
  msg: {
    from?: { id: number; is_bot?: boolean } | null;
    sender_chat?: { id: number; type?: string } | null;
  },
): Promise<boolean> {
  const numericChatId = Number(chatId);

  // Anonymous admin / linked channel posting as the chat itself
  if (msg.sender_chat && Number(msg.sender_chat.id) === numericChatId) {
    return true;
  }

  const from = msg.from;
  if (!from || from.is_bot) return false;

  try {
    const member = await api.getChatMember(String(chatId), from.id);
    return (
      member.status === "creator" || member.status === "administrator"
    );
  } catch (err) {
    console.warn("[bot] getChatMember failed for group ingest gate", err);
    return false;
  }
}

export function listingCaptionFromMessage(msg: {
  text?: string;
  caption?: string;
}): string {
  return (msg.text ?? msg.caption ?? "").trim();
}

export type ListingPhotoMsg = {
  photo?: { file_id: string; file_size?: number; width?: number }[];
  media_group_id?: string;
  message_id: number;
};

export function extractListingPhotos(
  msg: ListingPhotoMsg,
  pickBest: (photos: NonNullable<ListingPhotoMsg["photo"]>) => string | null,
): { fileId: string }[] {
  if (!msg.photo?.length) return [];
  const fileId = pickBest(msg.photo);
  return fileId ? [{ fileId }] : [];
}

/** Narrow Context message-like objects used for listing ingest. */
export function messageFromContext(
  ctx: Context,
):
  | (NonNullable<Context["message"]> & { chat: { id: number; type: string } })
  | (NonNullable<Context["channelPost"]> & {
      chat: { id: number; type: string };
    })
  | (NonNullable<Context["editedMessage"]> & {
      chat: { id: number; type: string };
    })
  | (NonNullable<Context["editedChannelPost"]> & {
      chat: { id: number; type: string };
    })
  | null {
  const msg =
    ctx.channelPost ??
    ctx.editedChannelPost ??
    ctx.message ??
    ctx.editedMessage;
  if (!msg || !("chat" in msg) || !msg.chat) return null;
  return msg as typeof msg & { chat: { id: number; type: string } };
}
