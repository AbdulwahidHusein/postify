import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getViewer } from "@/server/request";
import { BuyerThread } from "@/components/chat/buyer-thread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation" };

export default async function BuyerThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getViewer();
  if (!user) redirect(`/login?next=/inbox/${id}`);
  return (
    <main className="mx-auto max-w-2xl px-4 py-4">
      <Link href="/inbox" className="mb-3 inline-flex items-center gap-1 text-sm text-mist"><ChevronLeft size={16} /> Messages</Link>
      <BuyerThread id={id} />
    </main>
  );
}
