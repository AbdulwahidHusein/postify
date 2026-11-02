"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type Channel = { id: string; title: string | null; username: string | null; chatType: string; status: string; canEditMessages: boolean; canPostMessages: boolean; botIsAdmin: boolean; lastPostAt: string | null };
type Health = { inline: number; cards: number; failing: number; pending: number; deleted: number; lastSyncedAt: string | null };

export function ChannelCard({ handle, channel, health, rightsLink }: { handle: string; channel: Channel; health: Health; rightsLink: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const isChannel = channel.chatType === "channel";
  const rightsOk = isChannel ? channel.canEditMessages && channel.canPostMessages : channel.botIsAdmin;

  async function act(name: string, url: string, method = "POST", success: string) {
    setBusy(name);
    try {
      await api(url, { method });
      toast(success, "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {channel.title ?? "Untitled chat"}
            <Badge variant="neutral">{isChannel ? "Channel" : "Group"}</Badge>
            {channel.status === "connected" ? <Badge variant="success">Connected</Badge> : <Badge variant="danger">Disconnected</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-mist">{channel.username ? `@${channel.username} · ` : ""}{channel.lastPostAt ? `last post ${timeAgo(channel.lastPostAt)}` : "no posts yet"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act("refresh", `/api/shops/${handle}/channels/${channel.id}/refresh`, "POST", "Rights checked")}>
            <RefreshCw size={14} /> Check rights
          </Button>
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act("repair", `/api/shops/${handle}/channels/${channel.id}/repair`, "POST", "Repair started")}>
            Repair all buttons
          </Button>
          {channel.status === "connected" ? (
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => confirm("Disconnect this chat? New posts will stop becoming products.") && act("disconnect", `/api/shops/${handle}/channels/${channel.id}`, "DELETE", "Disconnected")}>
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${rightsOk ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
        {rightsOk ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
        <div className="flex-1">
          {rightsOk
            ? isChannel ? "The bot can add Order buttons to your posts." : "The bot is an admin and sees admin posts."
            : isChannel ? "The bot can't edit your posts, so buttons appear in a card under each post." : "Make the bot an admin so new posts become products."}
        </div>
        {!rightsOk ? <a href={rightsLink} className={buttonVariants({ size: "sm" })}>Fix in Telegram</a> : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div><dt className="text-xs text-mist">Buttons on post</dt><dd className="font-semibold tabular-nums">{health.inline}</dd></div>
        <div><dt className="text-xs text-mist">Card under post</dt><dd className="font-semibold tabular-nums">{health.cards}</dd></div>
        <div><dt className="text-xs text-mist">Updating</dt><dd className="font-semibold tabular-nums">{health.pending}</dd></div>
        <div><dt className="text-xs text-mist">Failing</dt><dd className={`font-semibold tabular-nums ${health.failing ? "text-danger" : ""}`}>{health.failing}</dd></div>
        <div><dt className="text-xs text-mist">Deleted posts</dt><dd className="font-semibold tabular-nums">{health.deleted}</dd></div>
      </dl>
      {health.lastSyncedAt ? <p className="mt-2 text-xs text-mist">Last button update {timeAgo(health.lastSyncedAt)}</p> : null}
    </section>
  );
}
