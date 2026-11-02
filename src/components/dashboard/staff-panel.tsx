"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Member = { id: string; userId: string; role: string; name: string; username: string | null };

export function StaffPanel({ handle, members, canManage, me }: { handle: string; members: Member[]; canManage: boolean; me: string }) {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [link, setLink] = useState<string | null>(null);

  async function invite() {
    try {
      const res = await api<{ link: string }>(`/api/shops/${handle}/members`, { body: { role } });
      setLink(res.link);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create the invite", "error");
    }
  }
  async function remove(id: string) {
    if (!confirm("Remove this person from the shop?")) return;
    try {
      await api(`/api/shops/${handle}/members/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "error");
    }
  }

  return (
    <section className="card grid gap-4 p-4 md:grid-cols-[240px_1fr] md:p-6">
      <div>
        <h2 className="text-sm font-semibold">Staff</h2>
        <p className="mt-1 text-xs text-mist">Admins can do everything except manage staff. Staff handle products, orders and messages.</p>
      </div>
      <div className="space-y-3">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="flex-1">{m.name}{m.username ? <span className="text-mist"> @{m.username}</span> : null}</span>
              <Badge variant={m.role === "owner" ? "default" : "neutral"}>{m.role}</Badge>
              {canManage && m.role !== "owner" && m.userId !== me ? <button onClick={() => remove(m.id)} className="text-xs text-danger">Remove</button> : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-9 w-auto" value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
              <option value="staff">Staff</option><option value="admin">Admin</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={invite}><UserPlus size={15} /> Create invite link</Button>
          </div>
        ) : null}
        {link ? (
          <div className="flex items-center gap-2 rounded-lg bg-paper-muted px-3 py-2 text-xs">
            <span className="flex-1 truncate">{link}</span>
            <button onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied"))} className="text-accent-ink"><Copy size={14} /></button>
          </div>
        ) : null}
        {link ? <p className="text-xs text-mist">Send this one-time link. It opens the Goods bot and adds them to your shop. Valid for 7 days.</p> : null}
      </div>
    </section>
  );
}
