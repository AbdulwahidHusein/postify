"use client";

import { useEffect, useRef } from "react";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { telegramBotUsername } from "@/lib/env";

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
    return (
      <section className="setup-wizard">
        <h1 className="setup-wizard-title">Connected</h1>
        <p className="setup-wizard-lead">
          {linked.title ?? linked.username ?? "Your channel"} · {shop.name}
        </p>
        <p className="setup-wizard-step">
          Post a photo with a price in the channel.
        </p>
      </section>
    );
  }

  return (
    <section className="setup-wizard">
      <h1 className="setup-wizard-title">Connect your channel</h1>
      <p className="setup-wizard-lead">One step. About a minute.</p>

      <ol className="setup-wizard-steps">
        <li>
          Open your Telegram channel
        </li>
        <li>
          Subscribers → Add subscriber → {bot}
        </li>
        <li>
          The bot will start syncing posts automatically
        </li>
      </ol>

      <p className="setup-wizard-wait" aria-live="polite">
        Waiting for the bot…
      </p>

      <p className="setup-wizard-alt">
        Or open {bot} and forward any post from your channel.
      </p>
    </section>
  );
}
