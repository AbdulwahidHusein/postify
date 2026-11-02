"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
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
};

type Action = "confirm" | "ship" | "deliver" | "cancel" | "mark_paid";

const NEXT: Record<string, { action: Action; label: string }[]> = {
  placed: [{ action: "confirm", label: "Confirm order" }, { action: "deliver", label: "Mark delivered" }],
  confirmed: [{ action: "ship", label: "Mark on the way" }, { action: "deliver", label: "Mark delivered" }],
  shipped: [{ action: "deliver", label: "Mark delivered" }],
  delivered: [],
  completed: [],
  cancelled: [],
};

export function OrderActions({ handle, order }: { handle: string; order: Order }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: Action, extra?: { reason?: string }) {
    setBusy(action);
    try {
      await api(`/api/shops/${handle}/orders/${order.id}`, { body: { action, ...extra } });
      toast(action === "mark_paid" ? "Payment recorded" : "Order updated", "success");
      setCancelOpen(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the order", "error");
    } finally {
      setBusy(null);
    }
  }

  const slip = [
    `Order #${order.number}`,
    `${order.contactName} · ${formatPhone(order.contactPhone)}`,
    order.fulfillment === "pickup" ? "Pickup" : `Address: ${order.address ?? ""}`,
    ...order.lines.map((l) => `• ${l.title} × ${l.quantity}`),
    `Collect: ${formatMoney(order.totalMinor, order.currency)}${order.paymentStatus === "paid" ? " (already paid)" : ""}`,
  ].join("\n");

  const next = NEXT[order.status] ?? [];
  const canPay = order.paymentStatus === "pending" && order.status !== "cancelled";
  const canCancel = ["placed", "confirmed", "shipped"].includes(order.status);

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      {next.map((n, i) => (
        <Button key={n.action} variant={i === 0 ? "primary" : "secondary"} disabled={busy !== null} onClick={() => run(n.action)}>
          {busy === n.action ? "Saving…" : n.label}
        </Button>
      ))}
      {canPay ? (
        <Button variant={next.length ? "secondary" : "primary"} disabled={busy !== null} onClick={() => run("mark_paid")}>
          {busy === "mark_paid" ? "Saving…" : "Payment received"}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(slip).catch(() => undefined);
          toast("Delivery slip copied. Paste it to your rider.");
        }}
      >
        <Copy size={16} /> Copy delivery slip
      </Button>
      {canCancel ? (
        <Button variant="danger" className="ml-auto" disabled={busy !== null} onClick={() => setCancelOpen(true)}>Cancel</Button>
      ) : null}
      {!next.length && !canPay && !canCancel ? <p className="px-1 text-sm text-mist">Nothing left to do for this order.</p> : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel order #${order.number}?`} description="Items go back into stock and the buyer is told in Telegram.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shared with the buyer), e.g. Out of stock" maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Button>
          <Button variant="danger" disabled={busy !== null} onClick={() => run("cancel", { reason: reason.trim() || undefined })}>
            {busy === "cancel" ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
