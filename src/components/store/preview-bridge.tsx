"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lives in the storefront only inside the customizer's preview frame.
 * The editor posts "refresh" after each autosave and "select" when a
 * section is picked; clicking a section here tells the editor which one.
 */
export function PreviewBridge() {
  const router = useRouter();
  useEffect(() => {
    let selected: string | null = null;
    const mark = (id: string | null) => {
      document.querySelectorAll("[data-section-id]").forEach((el) => {
        (el as HTMLElement).style.outline = el.getAttribute("data-section-id") === id ? "3px solid #ff5a36" : "";
        (el as HTMLElement).style.outlineOffset = "6px";
        (el as HTMLElement).style.borderRadius = "28px";
      });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as { type?: string; id?: string };
      if (msg?.type === "goods:refresh") router.refresh();
      if (msg?.type === "goods:select" && msg.id) {
        selected = msg.id;
        mark(selected);
        document.querySelector(`[data-section-id="${CSS.escape(msg.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-section-id]");
      if (!el) return;
      const id = el.getAttribute("data-section-id");
      if ((e.target as HTMLElement).closest("a,button,input,summary")) e.preventDefault();
      selected = id;
      mark(selected);
      window.parent.postMessage({ type: "goods:pick", id }, window.location.origin);
    };
    const observer = new MutationObserver(() => mark(selected));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    window.parent.postMessage({ type: "goods:ready" }, window.location.origin);
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);
  return null;
}
