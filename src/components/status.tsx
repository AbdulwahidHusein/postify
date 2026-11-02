import { Badge } from "@/components/ui/badge";

type Tone = "default" | "neutral" | "success" | "warning" | "danger" | "info";

const ORDER: Record<string, { label: string; v: Tone }> = {
  placed: { label: "To confirm", v: "warning" },
  confirmed: { label: "Confirmed", v: "info" },
  shipped: { label: "On the way", v: "info" },
  delivered: { label: "Delivered", v: "success" },
  completed: { label: "Completed", v: "success" },
  cancelled: { label: "Cancelled", v: "neutral" },
};

export function OrderStatus({ status }: { status: string }) {
  const s = ORDER[status] ?? { label: status, v: "neutral" as const };
  return <Badge variant={s.v} dot>{s.label}</Badge>;
}

export function PaymentStatus({ status }: { status: string }) {
  if (status === "paid") return <Badge variant="success" dot>Paid</Badge>;
  if (status === "voided") return <Badge variant="neutral" dot>Voided</Badge>;
  return <Badge variant="outline" dot>Unpaid</Badge>;
}

const PRODUCT: Record<string, { label: string; v: Tone }> = {
  published: { label: "Active", v: "success" },
  draft: { label: "Draft", v: "neutral" },
  sold: { label: "Sold", v: "neutral" },
  archived: { label: "Archived", v: "neutral" },
};

export function ProductStatus({ status }: { status: string }) {
  const s = PRODUCT[status] ?? { label: status, v: "neutral" as const };
  return <Badge variant={s.v} dot>{s.label}</Badge>;
}
