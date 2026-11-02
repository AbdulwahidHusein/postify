"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

export function CustomerControls({ handle, id, notes, blocked }: { handle: string; id: string; notes: string; blocked: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(notes);
  const [isBlocked, setBlocked] = useState(blocked);
  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/shops/${handle}/customers/${id}`, { method: "PATCH", body });
      toast("Saved", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    }
  }
  return (
    <aside className="space-y-5">
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Private notes</h2>
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Prefers evening delivery…" maxLength={2000} />
        <Button size="sm" variant="secondary" onClick={() => patch({ notes: value.trim() || null })}>Save notes</Button>
      </section>
      <section className="card p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <b className="block">Block this buyer</b>
            <span className="text-mist">They won&apos;t be able to place new orders.</span>
          </span>
          <Switch checked={isBlocked} onCheckedChange={(v) => { setBlocked(v); void patch({ blocked: v }); }} />
        </label>
      </section>
    </aside>
  );
}
