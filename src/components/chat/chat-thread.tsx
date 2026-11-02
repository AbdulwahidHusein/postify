"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Send } from "lucide-react";
import { api, uploadImage } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type Msg = { id: string; role: "buyer" | "seller" | "system"; kind: string; body: string; image: string | null; clientId: string | null; createdAt: string; pending?: boolean };
type Header = {
  status: string;
  shop: { handle: string; name: string } | null;
  buyer: { name: string; username: string | null } | null;
  product: { id: string; slug: string; title: string; status: string; priceMinor: string | null; currency: string; image: string | null } | null;
};

const POLL_MS = 4000;

/** Chat thread for both sides. Polls every 4 s only while the tab is visible. */
export function ChatThread({ conversationId, productHref }: { conversationId: string; productHref?: (h: Header) => string | null }) {
  const toast = useToast();
  const [header, setHeader] = useState<Header | null>(null);
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastAt = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((cur) => {
      const byClient = new Map(cur.filter((m) => m.clientId).map((m) => [m.clientId!, m]));
      const ids = new Set(cur.map((m) => m.id));
      const next = cur.filter((m) => !(m.pending && incoming.some((i) => i.clientId && i.clientId === m.clientId)));
      for (const m of incoming) if (!ids.has(m.id) && !(m.clientId && byClient.get(m.clientId) && !byClient.get(m.clientId)!.pending)) next.push(m);
      return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    lastAt.current = incoming.at(-1)!.createdAt;
  }, []);

  useEffect(() => {
    let stop = false;
    api<{ role: "buyer" | "seller"; conversation: Header; messages: Msg[] }>(`/api/conversations/${conversationId}`)
      .then((d) => {
        if (stop) return;
        setHeader(d.conversation);
        setRole(d.role);
        merge(d.messages);
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Could not load the chat", "error"));
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const after = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      api<{ messages: Msg[] }>(`/api/conversations/${conversationId}${after}`).then((d) => !stop && merge(d.messages)).catch(() => undefined);
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [conversationId, merge, toast]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(body: string, imageKey?: string) {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Msg = { id: clientId, role, kind: imageKey ? "image" : "text", body, image: null, clientId, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, optimistic]);
    try {
      const { message } = await api<{ message: Msg }>(`/api/conversations/${conversationId}/messages`, { body: { body, clientId, imageKey } });
      merge([message]);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== clientId));
      toast(err instanceof Error ? err.message : "Message not sent", "error");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    await send(body);
    setSending(false);
  }

  async function onFile(file?: File) {
    if (!file) return;
    try {
      const key = await uploadImage(`/api/conversations/${conversationId}/upload`, file);
      await send("", key);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    }
  }

  const p = header?.product;
  const href = header && productHref ? productHref(header) : null;
  return (
    <div className="card flex h-[calc(100dvh-180px)] min-h-[420px] flex-col overflow-hidden lg:h-[calc(100dvh-140px)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {p?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : <div className="h-10 w-10 rounded-lg bg-paper-muted" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{role === "seller" ? header?.buyer?.name ?? "Buyer" : header?.shop?.name ?? "Seller"}</p>
          {p ? (
            href ? <Link href={href} className="block truncate text-xs text-signal">{p.title} · {p.priceMinor ? formatMoney(p.priceMinor, p.currency) : "Ask for price"}</Link>
              : <p className="truncate text-xs text-mist">{p.title}</p>
          ) : null}
        </div>
        {p?.status === "sold" ? <span className="rounded bg-paper-muted px-2 py-0.5 text-xs">Sold</span> : null}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-paper px-4 py-4">
        {messages.map((m) => {
          const mine = m.role === role;
          if (m.role === "system") return <p key={m.id} className="mx-auto max-w-sm whitespace-pre-wrap rounded-lg bg-paper-muted px-3 py-2 text-center text-xs text-mist">{m.body}</p>;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "rounded-br-sm bg-signal text-white" : "rounded-bl-sm bg-surface", m.pending && "opacity-60")}>
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" className="mb-1 max-h-64 rounded-lg" />
                ) : m.kind === "image" ? <p className="italic">Photo…</p> : null}
                {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                <p className={cn("mt-0.5 text-[10px]", mine ? "text-white/70" : "text-mist")}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        {!messages.length ? <p className="pt-10 text-center text-sm text-mist">Say hello 👋</p> : null}
        <div ref={bottom} />
      </div>
      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line p-2">
        <button type="button" aria-label="Send a photo" onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-mist hover:bg-paper-muted"><ImagePlus size={20} /></button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          className="textarea min-h-10 flex-1 resize-none py-2"
        />
        <button type="submit" aria-label="Send" disabled={!text.trim() || sending} className="rounded-lg bg-signal p-2.5 text-white disabled:opacity-40"><Send size={18} /></button>
      </form>
    </div>
  );
}
