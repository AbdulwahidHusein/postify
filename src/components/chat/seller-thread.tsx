"use client";

import { ChatThread } from "@/components/chat/chat-thread";

export function SellerThread({ handle, id }: { handle: string; id: string }) {
  return <ChatThread conversationId={id} productHref={(h) => (h.product ? `/dashboard/${handle}/products/${h.product.id}` : null)} />;
}
