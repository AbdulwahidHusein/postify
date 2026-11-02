"use client";

import { useEffect, useRef } from "react";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { telegramBotUsername } from "@/lib/env";

function isGroupSource(chatType: string | null | undefined) {
  return chatType === "group" || chatType === "supergroup";
}

export function SetupWizard({ onConnected }: { onConnected?: () => void }) {
  const { shop, channels, reload } = useShopAdmin();
  const linked = channels[0];
  const wasLinked = useRef(Boolean(linked));
  const bot = telegramBotUsername
    ? `@${telegramBotUsername.replace(/^@/, "")}`
    : "the bot";

  useEffect(() => {
    if (linked) return;
    const id = setInterval(() => {
      void reload();
    }, 2500);
    return () => clearInterval(id);
  }, [linked, reload]);

  useEffect(() => {
    if (linked && !wasLinked.current) {
      onConnected?.();
    }
    wasLinked.current = Boolean(linked);
  }, [linked, onConnected]);

  if (!shop) return null;

  if (linked) {
    const group = isGroupSource(linked.chatType);
    return (
      <section className="setup-wizard">
        <h1 className="setup-wizard-title">Connected</h1>
        <p className="setup-wizard-lead">
          {linked.title ?? linked.username ?? (group ? "Your group" : "Your channel")}{" "}
          · {shop.name}
        </p>
        <p className="setup-wizard-step">
          {group
            ? "Post a photo with a price as a group admin."
            : "Post a photo with a price in the channel."}
        </p>
      </section>
    );
  }

  return (
    <section className="setup-wizard">
      <h1 className="setup-wizard-title">Connect Telegram</h1>
      <p className="setup-wizard-lead">Channel or group. About a minute.</p>

      <ol className="setup-wizard-steps">
        <li>
          Channel: Subscribers → Add subscriber → {bot}
        </li>
        <li>
          Group: add {bot} as an admin (only admin posts become products)
        </li>
        <li>
          Posts sync automatically
        </li>
      </ol>

      <p className="setup-wizard-wait" aria-live="polite">
        Waiting for the bot…
      </p>

      <p className="setup-wizard-alt">
        Or open {bot} and forward any post from your channel or group.
      </p>
    </section>
  );
}
