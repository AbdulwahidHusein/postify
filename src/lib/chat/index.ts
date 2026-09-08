import "server-only";

export {
  ChatError,
  MAX_MESSAGE_LENGTH,
  assertConversationAccess,
  closeConversation,
  countSellerUnread,
  findConversationByTelegramReply,
  getOrCreateProductConversation,
  getUserByTelegramId,
  listBuyerInbox,
  listMessages,
  listSellerInbox,
  sendMessage,
  serializeConversation,
  serializeMessage,
} from "@/lib/chat/conversations";

export { enqueueChatNotify, flushOutbox } from "@/lib/chat/outbox";

import { enqueueChatNotify } from "@/lib/chat/outbox";
import { sendMessage } from "@/lib/chat/conversations";

/** Persist message then enqueue Telegram notify (non-blocking flush). */
export async function sendMessageAndNotify(input: {
  conversationId: string;
  userId: string;
  body?: string;
  imageUrl?: string | null;
  clientId?: string | null;
}) {
  const result = await sendMessage(input);
  if (!result.duplicate) {
    await enqueueChatNotify({
      kind:
        result.role === "buyer" ? "seller_new_message" : "buyer_new_message",
      messageId: result.message.id,
      conversationId: result.conversation.id,
    });
  }
  return result;
}
