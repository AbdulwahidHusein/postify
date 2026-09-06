"use client";

import { useState } from "react";
import { CategoriesMultiSelect } from "@/components/admin/categories-multi-select";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import type { AdminShop } from "@/components/admin/types";

function SettingsFormFields({
  shop,
  reload,
}: {
  shop: AdminShop;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [description, setDescription] = useState(shop.description ?? "");
  const [currency, setCurrency] = useState(
    shop.settings.defaultCurrency || "ETB",
  );
  const [telegramChannel, setTelegramChannel] = useState(
    shop.settings.telegramChannel ?? "",
  );
  const [ownerUsername, setOwnerUsername] = useState(
    shop.settings.ownerUsername ?? "",
  );
  const [ownerPhone, setOwnerPhone] = useState(shop.settings.ownerPhone ?? "");
  const [sellCategories, setSellCategories] = useState<string[]>(
    shop.settings.sellCategories ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shop.slug)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          settings: {
            defaultCurrency: currency.trim() || "ETB",
            telegramChannel: telegramChannel.trim() || null,
            ownerUsername: ownerUsername.trim() || null,
            ownerPhone: ownerPhone.trim() || null,
            sellCategories,
            linkMode: "reply",
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-panel admin-form" onSubmit={onSubmit}>
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Settings</p>
          <h1 className="admin-h1">Shop profile</h1>
          <p className="admin-lead">
            Storefront details, sync rules, contact, and what you sell.
          </p>
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="admin-success">Saved.</p> : null}

      <p className="admin-kicker">Basics</p>
      <label className="admin-field">
        <span>Shop name</span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </label>

      <label className="admin-field">
        <span>Description</span>
        <textarea
          className="field"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="What you sell and who it’s for"
        />
      </label>

      <div className="admin-form-grid">
        <label className="admin-field">
          <span>Default currency</span>
          <input
            className="field"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={8}
          />
        </label>
      </div>

      <p className="admin-kicker">Storefront contact</p>
      <label className="admin-field">
        <span>Public Telegram channel (@ or link)</span>
        <input
          className="field"
          value={telegramChannel}
          onChange={(e) => setTelegramChannel(e.target.value)}
          placeholder="@mystore or https://t.me/mystore"
          maxLength={160}
        />
        <span className="admin-hint">
          Shown on your storefront for buyers — separate from the bot-connected
          channel under Channels.
        </span>
      </label>

      <div className="admin-form-grid">
        <label className="admin-field">
          <span>Owner username (optional)</span>
          <input
            className="field"
            value={ownerUsername}
            onChange={(e) => setOwnerUsername(e.target.value)}
            placeholder="@seller or display name"
            maxLength={80}
          />
        </label>
        <label className="admin-field">
          <span>Owner phone (optional)</span>
          <input
            className="field"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="+251…"
            maxLength={32}
            inputMode="tel"
          />
        </label>
      </div>

      <p className="admin-kicker">Catalog focus</p>
      <CategoriesMultiSelect
        value={sellCategories}
        onChange={setSellCategories}
        disabled={saving}
      />

      <p className="admin-hint">
        Public URL · /s/{shop.slug} (slug is fixed after create)
      </p>

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function SettingsForm() {
  const { shop, reload } = useShopAdmin();
  if (!shop) return null;
  return (
    <SettingsFormFields
      key={`${shop.id}:${shop.updatedAt}`}
      shop={shop}
      reload={reload}
    />
  );
}
