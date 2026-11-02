"use client";

import { useEffect, useRef, useState } from "react";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { telegramBotUsername } from "@/lib/env";

function isGroupSource(chatType: string | null | undefined) {
  return chatType === "group" || chatType === "supergroup";
}

export function ChannelPanel() {
  const { shop, channels, reload } = useShopAdmin();
  const linked = channels[0];
  const bot = telegramBotUsername
    ? `@${telegramBotUsername.replace(/^@/, "")}`
    : "the bot";
  const polling = useRef(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = linked ? isGroupSource(linked.chatType) : false;

  useEffect(() => {
    if (!shop || linked) return;
    polling.current = true;
    const id = setInterval(() => {
      void reload();
    }, 2500);
    return () => {
      polling.current = false;
      clearInterval(id);
    };
  }, [shop, linked, reload]);

  if (!shop) return null;

  async function onDisconnect() {
    if (
      !confirm(
        "Disconnect this source? The bot will stop creating products from posts. You can reconnect anytime.",
      )
    )
      return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/channels/disconnect?shopSlug=${encodeURIComponent(shop!.slug)}`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not disconnect");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="admin-stack">
      <header className="admin-section-head">
        <div>
          <h1 className="admin-h1">Source</h1>
          <p className="admin-lead">
            {linked
              ? group
                ? "Linked group · only admin posts become products."
                : "Linked channel · syncing products."
              : `Connect a Telegram channel or group with ${bot}.`}
          </p>
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {linked ? (
        <section className="admin-panel">
          <h2 className="admin-h2">
            {linked.title ?? linked.username ?? "Connected"}
            <span className="admin-muted" style={{ fontWeight: 400 }}>
              {" "}
              · {group ? "group" : "channel"}
            </span>
          </h2>
          <p className="admin-muted">
            {linked.lastPostAt
              ? `Last activity ${new Date(linked.lastPostAt).toLocaleString()}`
              : "Waiting for posts"}
          </p>
          {group ? (
            <p className="admin-hint" style={{ marginTop: "0.75rem" }}>
              Only posts from group admins are imported. Member messages are
              ignored.
            </p>
          ) : null}
          <div className="admin-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm is-danger"
              disabled={disconnecting}
              onClick={() => void onDisconnect()}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </section>
      ) : (
        <section className="admin-panel">
          <h2 className="admin-h2">Channel</h2>
          <ol className="setup-wizard-steps" style={{ margin: 0 }}>
            <li>Open your Telegram channel</li>
            <li>Subscribers → Add subscriber → {bot}</li>
            <li>Posts sync automatically</li>
          </ol>

          <h2 className="admin-h2" style={{ marginTop: "1.5rem" }}>
            Group
          </h2>
          <ol className="setup-wizard-steps" style={{ margin: 0 }}>
            <li>Open your Telegram group</li>
            <li>Add {bot} as an admin</li>
            <li>Only admin posts become products</li>
          </ol>

          <p className="admin-muted" style={{ marginTop: "1rem" }}>
            Waiting…
          </p>
          <p className="admin-hint">
            Or forward a channel/group post to {bot} in private chat.
          </p>
        </section>
      )}
    </div>
  );
}
