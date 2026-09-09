"use client";

import { useEffect, useRef } from "react";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { telegramBotUsername } from "@/lib/env";

export function ChannelPanel() {
  const { shop, channels, reload } = useShopAdmin();
  const linked = channels[0];
  const bot = telegramBotUsername
    ? `@${telegramBotUsername.replace(/^@/, "")}`
    : "the bot";
  const polling = useRef(false);

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

  return (
    <div className="admin-stack">
      <header className="admin-section-head">
        <div>
          <h1 className="admin-h1">Channel</h1>
          <p className="admin-lead">
            {linked ? "Linked and syncing products." : `Add ${bot} as admin.`}
          </p>
        </div>
      </header>

      {linked ? (
        <section className="admin-panel">
          <h2 className="admin-h2">
            {linked.title ?? linked.username ?? "Connected"}
          </h2>
          <p className="admin-muted">
            {linked.lastPostAt
              ? `Last activity ${new Date(linked.lastPostAt).toLocaleString()}`
              : "Waiting for posts"}
          </p>
        </section>
      ) : (
        <section className="admin-panel">
          <ol className="setup-wizard-steps" style={{ margin: 0 }}>
            <li>Open your Telegram channel</li>
            <li>Administrators → Add admin → {bot}</li>
            <li>Allow posting messages</li>
          </ol>
          <p className="admin-muted" style={{ marginTop: "1rem" }}>
            Waiting…
          </p>
          <p className="admin-hint">
            Or forward a channel post to {bot} in private chat.
          </p>
        </section>
      )}
    </div>
  );
}
