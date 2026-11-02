"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function CreateShopForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [locale, setLocale] = useState<"en" | "am">("en");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { shop } = await api<{ shop: { handle: string } }>("/api/shops", {
        body: { name, handle: handle || undefined, locale },
      });
      router.push(`/dashboard/${shop.handle}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the shop");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Field label="Shop name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Abel Phones" />
      </Field>
      <Field label="Shop address" hint="Optional. Letters, numbers and hyphens, e.g. abel-phones.">
        <Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="abel-phones" pattern="[a-z0-9-]{3,32}" />
      </Field>
      <Field label="Storefront language">
        <Select value={locale} onChange={(e) => setLocale(e.target.value as "en" | "am")}>
          <option value="en">English</option>
          <option value="am">አማርኛ (Amharic)</option>
        </Select>
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy} fullWidth>{busy ? "Creating…" : "Create shop"}</Button>
    </form>
  );
}
