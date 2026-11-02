"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ClipboardCopy, Phone, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Order = {
  id: string;
  number: number;
  status: string;
  paymentStatus: string;
  fulfillment: string;
  contactName: string;
  contactPhone: string;
  address: string | null;
  totalMinor: string;
  currency: string;
  lines: { title: string; quantity: number }[];
  placedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

type Action = "confirm" | "ship" | "deliver" | "cancel" | "mark_paid";

/** What the seller should do next, in their words. */
function nextStep(o: Order): { title: string; body: string; primary?: { action: Action; label: string; done: string }; secondary?: { action: Action; label: string; done: string } } {
  const collect = formatMoney(BigInt(o.totalMinor), o.currency);
  switch (o.status) {
    case "placed":
      return {
        title: `Call ${o.contactName.split(" ")[0]} to confirm`,
        body: "Check the item is available and agree on a delivery time, then confirm. The buyer gets a Telegram message.",
        primary: { action: "confirm", label: "Confirm order", done: "Order confirmed" },
        secondary: { action: "deliver", label: "Already delivered", done: "Marked as delivered" },
      };
    case "confirmed":
      return {
        title: o.fulfillment === "pickup" ? "Wait for pickup" : "Send it out",
        body: o.fulfillment === "pickup" ? "Mark it delivered when the buyer collects it." : "Copy the delivery slip for your rider, then mark it on the way.",
        primary: o.fulfillment === "pickup" ? { action: "deliver", label: "Picked up", done: "Marked as delivered" } : { action: "ship", label: "Mark on the way", done: "Marked on the way" },
        secondary: o.fulfillment === "pickup" ? undefined : { action: "deliver", label: "Mark delivered", done: "Marked as delivered" },
      };
    case "shipped":
      return { title: "On the way", body: `Mark it delivered when it arrives. Your rider collects ${collect}.`, primary: { action: "deliver", label: "Mark delivered", done: "Marked as delivered" } };
    case "delivered":
      return o.paymentStatus === "pending"
        ? { title: `Collect ${collect}`, body: "Record the payment once you have the cash or the transfer. That completes the order.", primary: { action: "mark_paid", label: "Payment received", done: "Payment recorded" } }
        : { title: "Delivered and paid", body: "Nothing left to do." };
    case "completed":
      return { title: "Completed", body: "Delivered and paid. Nothing left to do." };
    case "cancelled":
      return { title: "Cancelled", body: "Items went back into stock." };
    default:
      return { title: o.status, body: "" };
  }
}

const TRACK = [
  { key: "placed", label: "Placed", at: (o: Order) => o.placedAt },
  { key: "confirmed", label: "Confirmed", at: (o: Order) => o.confirmedAt },
  { key: "shipped", label: "Sent", at: (o: Order) => o.shippedAt },
  { key: "delivered", label: "Delivered", at: (o: Order) => o.deliveredAt },
  { key: "paid", label: "Paid", at: (o: Order) => (o.paymentStatus === "paid" ? o.completedAt ?? o.deliveredAt : null) },
];

export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled") return null;
  const reached = TRACK.map((t) => Boolean(t.at(order)));
  // Steps skipped (e.g. delivered without "on the way") still read as done.
  const last = reached.lastIndexOf(true);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Order progress">
      {TRACK.map((t, i) => {
        const done = i <= last;
        const at = t.at(order);
        return (
          <li key={t.key} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", done ? "bg-brand" : "bg-sunken")} />
            <p className={cn("mt-1.5 truncate text-[11px] font-semibold sm:text-xs", done ? "text-ink" : "text-faint")}>{t.label}</p>
            <p className="hidden truncate text-[11px] text-faint sm:block">
              {at ? new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : " "}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderActions({ handle, order }: { handle: string; order: Order }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: Action, done: string, extra?: { reason?: string }) {
    setBusy(action);
    try {
      await api(`/api/shops/${handle}/orders/${order.id}`, { body: { action, ...extra } });
      toast(done, "success");
      setCancelOpen(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update the order. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  const slip = [
    `Order #${order.number}`,
    `${order.contactName}, ${formatPhone(order.contactPhone)}`,
    order.fulfillment === "pickup" ? "Pickup" : `Address: ${order.address ?? ""}`,
    ...order.lines.map((l) => `- ${l.title} x ${l.quantity}`),
    `Collect: ${formatMoney(BigInt(order.totalMinor), order.currency)}${order.paymentStatus === "paid" ? " (already paid)" : ""}`,
  ].join("\n");

  const step = nextStep(order);
  const canCancel = ["placed", "confirmed", "shipped"].includes(order.status);
  const finished = !step.primary;

  return (
    <section className="panel overflow-hidden" aria-labelledby="next-step">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl", finished ? (order.status === "cancelled" ? "bg-sunken text-mist" : "bg-brand-soft text-brand-ink") : "bg-adey-soft text-adey-ink")}>
            {order.status === "cancelled" ? <X size={18} /> : finished ? <Check size={18} strokeWidth={2.5} /> : <span className="h-2.5 w-2.5 rounded-full bg-adey" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="next-step" className="font-display text-lg font-semibold leading-snug">{step.title}</h2>
            <p className="mt-0.5 text-sm text-mist">{step.body}</p>
          </div>
        </div>
        {order.status !== "cancelled" ? <div className="mt-5"><OrderProgress order={order} /></div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas px-4 py-3 sm:px-5">
        {step.primary ? (
          <Button disabled={busy !== null} onClick={() => run(step.primary!.action, step.primary!.done)} className="max-sm:flex-1">
            {busy === step.primary.action ? "Saving…" : step.primary.label}
          </Button>
        ) : null}
        {step.secondary ? (
          <Button variant="secondary" disabled={busy !== null} onClick={() => run(step.secondary!.action, step.secondary!.done)} className="max-sm:flex-1">
            {busy === step.secondary.action ? "Saving…" : step.secondary.label}
          </Button>
        ) : null}
        <a href={`tel:${order.contactPhone}`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-ink-soft hover:bg-sunken hover:text-ink">
          <Phone size={16} /> Call
        </a>
        {order.fulfillment !== "pickup" && order.status !== "cancelled" ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(slip).catch(() => undefined);
              toast("Delivery slip copied. Paste it to your rider.");
            }}
          >
            <ClipboardCopy size={16} /> Copy slip
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger sm:ml-auto" disabled={busy !== null} onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        ) : null}
      </div>

      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel order #${order.number}?`}
        description="Items go back into stock and the buyer gets a Telegram message with your reason."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button variant="danger-solid" disabled={busy !== null} onClick={() => run("cancel", "Order cancelled", { reason: reason.trim() || undefined })}>
              {busy === "cancel" ? "Cancelling…" : "Cancel order"}
            </Button>
          </>
        }
      >
        <label htmlFor="cancel-reason" className="field-label">Reason</label>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: sold out, or couldn't reach you by phone" maxLength={300} />
      </Dialog>
    </section>
  );
}
