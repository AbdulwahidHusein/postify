import { Badge } from "@/components/ui/badge";

const ORDER: Record<string, { label: string; v: "default" | "neutral" | "success" | "warning" | "danger" }> = {
  placed: { label: "To confirm", v: "warning" },
  confirmed: { label: "Confirmed", v: "default" },
  shipped: { label: "On the way", v: "default" },
  delivered: { label: "Delivered", v: "success" },
  completed: { label: "Completed", v: "success" },
  cancelled: { label: "Cancelled", v: "neutral" },
};

export function OrderStatus({ status }: { status: string }) {
  const s = ORDER[status] ?? { label: status, v: "neutral" as const };
  return <Badge variant={s.v}>{s.label}</Badge>;
}

export function PaymentStatus({ status }: { status: string }) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "voided") return <Badge variant="neutral">Voided</Badge>;
  return <Badge variant="outline">Pay on delivery</Badge>;
}

const PRODUCT: Record<string, { label: string; v: "default" | "neutral" | "success" | "warning" | "danger" }> = {
  published: { label: "Active", v: "success" },
  draft: { label: "Draft", v: "warning" },
  sold: { label: "Sold", v: "neutral" },
  archived: { label: "Archived", v: "neutral" },
};

export function ProductStatus({ status }: { status: string }) {
  const s = PRODUCT[status] ?? { label: status, v: "neutral" as const };
  return <Badge variant={s.v}>{s.label}</Badge>;
}
