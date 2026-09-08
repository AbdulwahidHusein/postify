"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { subscribeChatBottomInset } from "@/lib/chat/bottom-inset";

export type ChatProduct = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  price: number | null;
  currency: string;
  status: string;
  imageSrc: string | null;
};

export type ChatConversation = {
  id: string;
  status: string;
  unread: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  product: ChatProduct | null;
  shop: { id: string; name: string; slug: string } | null;
  buyer: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl: string | null;
  } | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderRole: "buyer" | "seller" | "system";
  senderUserId: string | null;
  kind?: "text" | "image" | "product";
  body: string;
  imageUrl?: string | null;
  clientId: string | null;
  createdAt: string;
};

const PROMPTS = [
  "Is this still available?",
  "What's the condition / size?",
  "Can you hold it for me?",
];

function formatMoney(p: ChatProduct) {
  if (p.price == null) return "Ask for price";
  return `${p.currency} ${p.price.toLocaleString()}`;
}

function newClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatThread({
  conversationId,
  role,
  showClose,
  backHref,
  backLabel = "Back",
}: {
  conversationId: string;
  role: "buyer" | "seller";
  showClose?: boolean;
  backHref: string;
  backLabel?: string;
}) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const focusedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [bottomInset, setBottomInset] = useState(34);
  const [lightbox, setLightbox] = useState<{
    images: { src: string; alt?: string }[];
    index: number;
  } | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("chat-open");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      root.classList.remove("chat-open");
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    return subscribeChatBottomInset((px) => {
      setBottomInset(px);
      document.documentElement.style.setProperty(
        "--chat-bottom-inset",
        `${px}px`,
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--chat-bottom-inset");
    };
  }, []);

  const applyPayload = useCallback(
    (
      data: {
        conversation?: ChatConversation;
        messages?: ChatMessage[];
      },
      mode: "replace" | "append",
    ) => {
      if (data.conversation) setConversation(data.conversation);
      if (data.messages) {
        if (mode === "replace") {
          setMessages(data.messages);
          lastIdRef.current =
            data.messages[data.messages.length - 1]?.id ?? null;
        } else if (data.messages.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const next = [...prev];
            for (const m of data.messages!) {
              if (!seen.has(m.id)) next.push(m);
            }
            return next;
          });
          lastIdRef.current =
            data.messages[data.messages.length - 1]?.id ?? lastIdRef.current;
        }
      }
    },
    [],
  );

  const load = useCallback(
    async (after?: string | null) => {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      const res = await fetch(`/api/conversations/${conversationId}${qs}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        conversation?: ChatConversation;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load chat");
      applyPayload(data, after ? "append" : "replace");
    },
    [applyPayload, conversationId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load(null);
        if (!cancelled) {
          setError(null);
          scrollToBottom(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const onVis = () => {
      focusedRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(() => {
      if (!focusedRef.current || !lastIdRef.current) return;
      void load(lastIdRef.current).catch(() => {});
    }, 2000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function clearPendingImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  function autoSize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function onSend(bodyOverride?: string) {
    const trimmed = (bodyOverride ?? text).trim();
    if ((!trimmed && !pendingFile) || sending) return;
    setSending(true);
    setError(null);
    const clientId = newClientId();
    const file = pendingFile;
    const preview = pendingPreview;
    const optimistic: ChatMessage = {
      id: `tmp_${clientId}`,
      conversationId,
      senderRole: role,
      senderUserId: user?.id ?? null,
      kind: file ? "image" : "text",
      body: trimmed,
      imageUrl: preview,
      clientId,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    clearPendingImage();
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set("body", trimmed);
        form.set("clientId", clientId);
        form.set("image", file);
        res = await fetch(`/api/conversations/${conversationId}`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
      } else {
        res = await fetch(`/api/conversations/${conversationId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed, clientId }),
        });
      }
      const data = (await res.json()) as {
        message?: ChatMessage;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      if (data.message) {
        setMessages((prev) => {
          const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
          if (withoutTmp.some((m) => m.id === data.message!.id)) {
            return withoutTmp;
          }
          return [...withoutTmp, data.message!];
        });
        lastIdRef.current = data.message.id;
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function onClose() {
    if (!confirm("Close this conversation?")) return;
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close" }),
    });
    if (res.ok) await load(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void onSend();
  }

  const product = conversation?.product;
  const shop = conversation?.shop;
  const buyer = conversation?.buyer;
  const closed = conversation?.status === "closed";
  const hasUserMessages = messages.some((m) => m.senderRole !== "system");
  const peerLabel =
    role === "seller"
      ? (buyer?.firstName ?? null)
      : (shop?.name ?? null);
  const peerHref =
    role === "buyer" && shop ? `/s/${shop.slug}` : null;

  return (
    <div
      className="chat-app chat-app--tg"
      style={
        {
          "--chat-bottom-inset": `${bottomInset}px`,
        } as CSSProperties
      }
    >
      <div className="chat-frame">
        <header className="chat-topbar">
          <Link href={backHref} className="chat-back">
            ← {backLabel}
          </Link>
          {showClose && !closed ? (
            <button
              type="button"
              className="chat-topbar-action"
              onClick={() => void onClose()}
            >
              Close
            </button>
          ) : null}
        </header>

        {product ? (
          <div className="chat-listing">
            <Link href={`/p/${product.slug}`} className="chat-listing-product">
              <span className="chat-listing-thumb" aria-hidden>
                {product.imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageSrc} alt="" />
                ) : null}
              </span>
              <span className="chat-listing-meta">
                <span className="chat-listing-title" title={product.title}>
                  {product.title}
                </span>
                <span className="chat-listing-price">
                  {formatMoney(product)}
                  {product.status === "sold" ? " · Sold" : ""}
                </span>
                {product.description ? (
                  <span
                    className="chat-listing-desc"
                    title={product.description}
                  >
                    {product.description}
                  </span>
                ) : null}
              </span>
            </Link>
            {peerLabel ? (
              peerHref ? (
                <Link
                  href={peerHref}
                  className="chat-listing-peer"
                  title={peerLabel}
                >
                  {peerLabel}
                </Link>
              ) : (
                <span className="chat-listing-peer" title={peerLabel}>
                  {peerLabel}
                </span>
              )
            ) : null}
          </div>
        ) : peerLabel ? (
          <div className="chat-listing chat-listing--peer-only">
            {peerHref ? (
              <Link
                href={peerHref}
                className="chat-listing-peer"
                title={peerLabel}
              >
                {peerLabel}
              </Link>
            ) : (
              <span className="chat-listing-peer" title={peerLabel}>
                {peerLabel}
              </span>
            )}
          </div>
        ) : null}

        {error ? <p className="chat-error">{error}</p> : null}
        {closed ? (
          <p className="chat-banner">Closed — send a message to reopen.</p>
        ) : null}

        <div
          ref={scrollRef}
          className="chat-scroll"
          role="log"
          aria-live="polite"
        >
          <div className="chat-scroll-inner">
            {loading ? (
              <p className="chat-muted">Loading…</p>
            ) : (
              <>
                {!hasUserMessages && role === "buyer" ? (
                  <div className="chat-empty">
                    <p>Ask about this item</p>
                    <div className="chat-prompts">
                      {PROMPTS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="chat-prompt"
                          onClick={() => void onSend(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {messages.map((m) => {
                  if (m.kind === "product") return null;
                  if (m.senderRole === "system") {
                    return (
                      <p key={m.id} className="chat-system">
                        {m.body}
                      </p>
                    );
                  }
                  const mine =
                    m.senderRole === role || m.senderUserId === user?.id;
                  return (
                    <div
                      key={m.id}
                      className={
                        mine ? "chat-bubble is-mine" : "chat-bubble is-theirs"
                      }
                    >
                      {m.imageUrl ? (
                        <button
                          type="button"
                          className="chat-bubble-img-btn"
                          onClick={() =>
                            setLightbox({
                              images: [{ src: m.imageUrl!, alt: "" }],
                              index: 0,
                            })
                          }
                          aria-label="View photo fullscreen"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.imageUrl}
                            alt=""
                            className="chat-bubble-img"
                          />
                        </button>
                      ) : null}
                      {m.body ? <p>{m.body}</p> : null}
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  );
                })}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form className="chat-composer" onSubmit={onSubmit}>
          {pendingPreview ? (
            <div className="chat-attach-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview} alt="" />
              <button
                type="button"
                className="chat-attach-clear"
                onClick={clearPendingImage}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="chat-composer-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={onPickImage}
            />
            <button
              type="button"
              className="chat-icon-btn"
              aria-label="Add photo"
              disabled={sending}
              onClick={() => fileRef.current?.click()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle
                  cx="9"
                  cy="10"
                  r="1.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 16l5-4 4 3 3-2 6 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                autoSize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              placeholder="Message…"
              maxLength={2000}
              disabled={sending}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={sending || (!text.trim() && !pendingFile)}
              aria-label="Send"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.4 1.18l2.3 6.72L14 12l-9.7.5-2.3 6.72a1 1 0 001.4 1.18z" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        onIndexChange={(i) =>
          setLightbox((prev) => (prev ? { ...prev, index: i } : prev))
        }
      />
    </div>
  );
}
