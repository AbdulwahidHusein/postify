import { Send } from "lucide-react";
import { requireShopPage } from "@/server/page";
import { listChannels, serializeChannel } from "@/server/domain/channels";
import { buttonHealth } from "@/server/domain/buttons";
import { botStartLink, channelRightsLink, groupRightsLink } from "@/server/services/telegram";
import { PageHeader } from "@/components/dashboard/page-header";
import { ChannelCard } from "@/components/dashboard/channel-card";
import { EmptyState } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telegram" };

export default async function TelegramPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop } = await requireShopPage(handle, "channels.manage", `/dashboard/${handle}/telegram`);
  const [chans, health] = await Promise.all([listChannels(shop.id), buttonHealth(shop.id)]);
  const connect = botStartLink("connect");
  return (
    <>
      <PageHeader
        title="Telegram"
        description="Your channels and groups, and the health of the Order buttons on your posts."
        actions={<a href={connect} className={buttonVariants()}><Send size={16} /> Connect a chat</a>}
      />
      {chans.length ? (
        <div className="space-y-4">
          {chans.map((c) => {
            const h = health.get(c.id);
            return (
              <ChannelCard
                key={c.id}
                handle={shop.handle}
                channel={serializeChannel(c)}
                health={{ inline: h?.inline ?? 0, cards: h?.cards ?? 0, failing: h?.failing ?? 0, pending: h?.pending ?? 0, deleted: h?.deleted ?? 0, lastSyncedAt: h?.lastSyncedAt?.toISOString() ?? null }}
                rightsLink={c.chatType === "channel" ? channelRightsLink() : groupRightsLink()}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Send size={28} />} title="No Telegram chats connected" body="Open the bot, tap Connect channel or Connect group, and pick your chat. Only chats you administer are shown."
          action={<a href={connect} className={buttonVariants()}>Open the bot</a>} />
      )}
      <section className="card mt-6 space-y-2 p-4 text-sm">
        <h2 className="font-semibold">How the Order button works</h2>
        <ul className="list-disc space-y-1 pl-5 text-mist">
          <li><b className="text-ink">Channels:</b> the button is added to your own post. The bot needs the “Edit messages of others” right.</li>
          <li><b className="text-ink">Albums and groups:</b> Telegram doesn&apos;t allow buttons there, so a small silent card with the button is posted right under the post.</li>
          <li>Prices, sold status and stock changes update the buttons automatically. Deleted posts hide their listing.</li>
        </ul>
      </section>
    </>
  );
}
