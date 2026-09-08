import type { Metadata } from "next";
import { BuyerInboxList } from "@/components/chat/buyer-inbox";

export const metadata: Metadata = {
  title: "Inbox",
};

export default function BuyerInboxPage() {
  return (
    <div className="buy-page">
      <div className="page-shell buy-shell chat-shell">
        <BuyerInboxList />
      </div>
    </div>
  );
}
