import { PageLoader } from "@/components/ui/loader";

export default function InboxLoading() {
  return (
    <div className="buy-page inbox-page">
      <div className="page-shell buy-shell chat-shell inbox-shell">
        <PageLoader label="Loading inbox" />
      </div>
    </div>
  );
}
