import Link from "next/link";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { getViewer } from "@/server/request";
import { listShopsForUser } from "@/server/domain/shops";
import { botStartLink } from "@/server/services/telegram";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardIndex() {
  const user = await getViewer();
  if (!user) redirect("/login?next=/dashboard");
  const shops = await listShopsForUser(user.id);
  if (shops.length) redirect(`/dashboard/${shops[0].shop.handle}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <p className="text-sm font-semibold text-signal">Welcome, {user.firstName}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Let&apos;s set up your shop</h1>
      <p className="mt-2 text-mist">
        Connect your Telegram channel or group. Every post with a photo and a price becomes a product with an Order button.
      </p>
      <ol className="mt-6 space-y-3 text-sm">
        <li className="card flex gap-3 p-4"><b className="text-signal">1</b> Open the Goods bot and tap <b>Connect channel</b> or <b>Connect group</b>.</li>
        <li className="card flex gap-3 p-4"><b className="text-signal">2</b> Pick your chat from the list. We create your shop automatically.</li>
        <li className="card flex gap-3 p-4"><b className="text-signal">3</b> Post as usual. Orders and messages arrive in the bot and here.</li>
      </ol>
      <a href={botStartLink("connect")} className={buttonVariants({ size: "lg", className: "mt-6" })}>
        <Send size={18} /> Connect in Telegram
      </a>
      <Link href="/dashboard/new" className="mt-3 text-center text-sm text-signal hover:underline">
        Or create a shop without a channel
      </Link>
    </main>
  );
}
