"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { toMajorString, toMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { SerializedShop } from "@/server/domain/shops";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card grid gap-4 p-4 md:grid-cols-[240px_1fr] md:p-6">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-mist">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span><span className="font-medium">{label}</span>{hint ? <span className="block text-xs text-mist">{hint}</span> : null}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function SettingsForm({ shop, aiUsage }: { shop: SerializedShop; aiUsage: { used: number; quota: number } }) {
  const router = useRouter();
  const toast = useToast();
  const s = shop.settings;
  const [name, setName] = useState(shop.name);
  const [description, setDescription] = useState(shop.description ?? "");
  const [locale, setLocale] = useState(shop.locale);
  const [status, setStatus] = useState(shop.status);
  const [ingestMode, setIngestMode] = useState(s.ingestMode);
  const [threshold, setThreshold] = useState(s.autoPublishMinConfidence);
  const [buttonsOnPosts, setButtonsOnPosts] = useState(s.buttonsOnPosts);
  const [buttonLanguage, setButtonLanguage] = useState(s.buttonLanguage);
  const [notifyOrders, setNotifyOrders] = useState(s.notifyOrders);
  const [notifyMessages, setNotifyMessages] = useState(s.notifyMessages);
  const [autoArchive, setAutoArchive] = useState(s.autoArchiveDays ? String(s.autoArchiveDays) : "");
  const [d, setD] = useState({ ...s.delivery, fee: toMajorString(s.delivery.deliveryFeeMinor || "0") });
  const [contact, setContact] = useState(s.contact);
  const [saving, setSaving] = useState(false);

  async function save() {
    const feeMinor = toMinor(d.fee || "0");
    if (feeMinor === null || feeMinor < 0n) return toast("Enter a valid delivery fee", "error");
    setSaving(true);
    try {
      await api(`/api/shops/${shop.handle}`, {
        method: "PATCH",
        body: {
          name, description: description.trim() || null, locale, status,
          ingestMode, autoPublishMinConfidence: threshold, buttonsOnPosts, buttonLanguage,
          notifyOrders, notifyMessages, autoArchiveDays: autoArchive ? Number(autoArchive) : null,
          delivery: { deliveryEnabled: d.deliveryEnabled, pickupEnabled: d.pickupEnabled, deliveryFeeMinor: feeMinor.toString(), deliveryNote: d.deliveryNote?.trim() || null, pickupAddress: d.pickupAddress?.trim() || null },
          contact: { phone: contact.phone?.trim() || null, telegramUsername: contact.telegramUsername?.replace(/^@/, "").trim() || null, address: contact.address?.trim() || null },
        },
      });
      toast("Settings saved", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Shop" description="How buyers see your shop.">
        <Field label="Shop name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label="About your shop"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Storefront language">
            <Select value={locale} onChange={(e) => setLocale(e.target.value)}><option value="en">English</option><option value="am">አማርኛ</option></Select>
          </Field>
          <Field label="Visibility">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "active" | "hidden")}><option value="active">Open to buyers</option><option value="hidden">Hidden while I set up</option></Select>
          </Field>
        </div>
      </Section>

      <Section title="Telegram listings" description="What happens when you post in your channel or group.">
        <Field label="New posts">
          <Select value={ingestMode} onChange={(e) => setIngestMode(e.target.value as typeof ingestMode)}>
            <option value="auto_publish">Publish automatically when the details are clear</option>
            <option value="always_draft">Always save as a draft for me to review</option>
            <option value="paused">Pause: don&apos;t create products from posts</option>
          </Select>
        </Field>
        {ingestMode === "auto_publish" ? (
          <Field label="Publish automatically when confidence is at least" hint="Lower publishes more posts without review; higher sends more to drafts.">
            <Select value={String(threshold)} onChange={(e) => setThreshold(Number(e.target.value))}>
              <option value="0.6">60%</option><option value="0.7">70%</option><option value="0.8">80% (recommended)</option><option value="0.9">90%</option>
            </Select>
          </Field>
        ) : null}
        <Toggle label="Order buttons on posts" hint="Adds Order, Ask seller and Shop buttons to every listing." checked={buttonsOnPosts} onChange={setButtonsOnPosts} />
        <Field label="Button language">
          <Select value={buttonLanguage} onChange={(e) => setButtonLanguage(e.target.value as "en" | "am")}><option value="en">English (🛒 Order)</option><option value="am">አማርኛ (🛒 ይዘዙ)</option></Select>
        </Field>
        <Field label="Archive listings automatically after" hint="Leave empty to keep listings until you change them.">
          <Select value={autoArchive} onChange={(e) => setAutoArchive(e.target.value)}>
            <option value="">Never</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
          </Select>
        </Field>
        <p className="text-xs text-mist">Automatic reading today: {aiUsage.used} of {aiUsage.quota} posts. After that, posts are saved as drafts for you to check.</p>
      </Section>

      <Section title="Delivery & pickup" description="Shown to buyers at checkout.">
        <Toggle label="Delivery" checked={d.deliveryEnabled} onChange={(v) => setD({ ...d, deliveryEnabled: v })} />
        {d.deliveryEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery fee (ETB)" hint="0 for free delivery."><Input inputMode="decimal" value={d.fee} onChange={(e) => setD({ ...d, fee: e.target.value })} /></Field>
            <Field label="Delivery note"><Input value={d.deliveryNote ?? ""} onChange={(e) => setD({ ...d, deliveryNote: e.target.value })} placeholder="Addis Ababa only, same day" /></Field>
          </div>
        ) : null}
        <Toggle label="Pickup" checked={d.pickupEnabled} onChange={(v) => setD({ ...d, pickupEnabled: v })} />
        {d.pickupEnabled ? <Field label="Pickup address"><Input value={d.pickupAddress ?? ""} onChange={(e) => setD({ ...d, pickupAddress: e.target.value })} placeholder="Bole, Friendship building, 2nd floor" /></Field> : null}
      </Section>

      <Section title="Payments" description="How buyers pay you.">
        <div className="flex items-center justify-between rounded-lg border border-line px-3 py-3 text-sm">
          <span><b className="block">Pay on delivery</b><span className="text-mist">Cash or transfer when the order arrives.</span></span>
          <Badge variant="success">On</Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-3 text-sm text-mist">
          <span><b className="block text-ink">Online payment</b>telebirr, CBE Birr and cards through Chapa.</span>
          <Badge variant="neutral">Coming soon</Badge>
        </div>
      </Section>

      <Section title="Contact" description="Shown on your storefront.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone"><Input value={contact.phone ?? ""} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          <Field label="Telegram username"><Input value={contact.telegramUsername ?? ""} onChange={(e) => setContact({ ...contact, telegramUsername: e.target.value })} placeholder="@yourshop" /></Field>
        </div>
        <Field label="Address"><Input value={contact.address ?? ""} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></Field>
      </Section>

      <Section title="Notifications" description="Messages from the Goods bot in Telegram.">
        <Toggle label="New orders" checked={notifyOrders} onChange={setNotifyOrders} />
        <Toggle label="Buyer messages" checked={notifyMessages} onChange={setNotifyMessages} />
      </Section>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <Button size="lg" onClick={save} disabled={saving} className="shadow-lg">{saving ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}
