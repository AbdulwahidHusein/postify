import type { Metadata } from "next";
import { ChatThread } from "@/components/chat/chat-thread";

type Props = PageProps<"/inbox/[id]">;

export const metadata: Metadata = {
  title: "Chat",
};

export default async function BuyerChatPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="buy-page">
      <div className="page-shell buy-shell chat-shell">
        <ChatThread
          conversationId={id}
          role="buyer"
          backHref="/inbox"
          backLabel="Inbox"
        />
      </div>
    </div>
  );
}
