"use client";

import { ChatThread } from "@/components/chat/chat-thread";

export function BuyerThread({ id }: { id: string }) {
  return <ChatThread conversationId={id} productHref={(h) => (h.product && h.shop ? `/s/${h.shop.handle}/p/${h.product.slug}` : null)} />;
}
