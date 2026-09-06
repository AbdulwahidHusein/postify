"use client";

import { useEffect, useRef, useState } from "react";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import { telegramBotUsername } from "@/lib/env";

export function ChannelPanel() {
  const { shop, channels, reload } = useShopAdmin();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [connectResult, setConnectResult] = useState<{
    code: string;
    expiresAt: string;
    instructions: string[];
  } | null>(null);
  const hadChannel = useRef(Boolean(channels[0]));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const botHandle = telegramBotUsername
    ? `@${telegramBotUsername.replace(/^@/, "")}`
    : null;

  const linked = channels[0];

  useEffect(() => {
    if (!waiting || !shop) return;

    pollRef.current = setInterval(() => {
      void reload();
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [waiting, shop, reload]);

  useEffect(() => {
    if (!shop) return;
    if (waiting && linked && !hadChannel.current) {
      setWaiting(false);
      setConnectResult(null);
      try {
        sessionStorage.setItem(`postify:connected:${shop.id}`, "1");
      } catch {
        // ignore
      }
    }
    hadChannel.current = Boolean(linked);
  }, [linked, waiting, shop]);

  if (!shop) return null;

  async function onConnect() {
    setConnecting(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/channels/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: shop!.id }),
      });
      const data = (await res.json()) as {
        code?: string;
        expiresAt?: string;
        instructions?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not start connect");
      hadChannel.current = Boolean(channels[0]);
      setConnectResult({
        code: data.code!,
        expiresAt: data.expiresAt!,
        instructions: data.instructions ?? [],
      });
      setWaiting(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  async function copyCode() {
    if (!connectResult) return;
    try {
      await navigator.clipboard.writeText(connectResult.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the code manually");
    }
  }

  return (
    <div className="admin-stack">
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Channels</p>
          <h1 className="admin-h1">Telegram link</h1>
          <p className="admin-lead">
            Connect a channel so product posts sync into your catalog.
            {botHandle ? ` Bot: ${botHandle}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={connecting || waiting}
          onClick={() => void onConnect()}
        >
          {connecting
            ? "Generating…"
            : waiting
              ? "Waiting…"
              : linked
                ? "Reconnect"
                : "Connect channel"}
        </button>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {waiting && !linked ? (
        <section className="admin-banner admin-banner-wait">
          <div>
            <strong>Waiting for the connect code in Telegram…</strong>
            <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
              Post the code as a channel message. This page updates
              automatically.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setWaiting(false);
            }}
          >
            Cancel wait
          </button>
        </section>
      ) : null}

      {linked && !waiting ? (
        <section className="admin-banner admin-banner-success">
          <div>
            <strong>Connected</strong>
            <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
              {linked.title ?? linked.username ?? "Channel linked"} · product
              posts sync live with an Open in shop button.
            </p>
          </div>
        </section>
      ) : null}

      <section className="admin-panel">
        <p className="admin-kicker">Status</p>
        {linked ? (
          <>
            <h2 className="admin-h2">
              {linked.title ?? linked.username ?? "Connected channel"}
            </h2>
            <p className="admin-muted">
              {linked.status}
              {linked.lastPostAt
                ? ` · last activity ${new Date(linked.lastPostAt).toLocaleString()}`
                : " · waiting for posts"}
            </p>
            <p className="admin-hint">
              Tip: include a price in the caption (e.g. ETB 4500) for cleaner
              titles and pricing.
            </p>
          </>
        ) : (
          <p className="admin-muted">
            No channel connected yet. Generate a code and post it in your
            channel.
          </p>
        )}
      </section>

      {connectResult ? (
        <section className="admin-panel admin-connect">
          <p className="admin-kicker">Connect code</p>
          <p className="admin-connect-code">{connectResult.code}</p>
          <div className="admin-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void copyCode()}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            {waiting ? (
              <span className="admin-hint" style={{ margin: 0 }}>
                Listening for channel post…
              </span>
            ) : null}
          </div>
          <ol className="admin-steps">
            {connectResult.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className="admin-hint">
            Expires {new Date(connectResult.expiresAt).toLocaleString()}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setConnectResult(null);
              if (!linked) setWaiting(false);
            }}
          >
            Hide code
          </button>
        </section>
      ) : null}
    </div>
  );
}
