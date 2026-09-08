"use client";

import { useRef, useState } from "react";
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
  const fileRef = useRef<HTMLInputElement>(null);
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
  const [logoUrl, setLogoUrl] = useState(shop.settings.logoUrl ?? null);
  const [logoSource, setLogoSource] = useState(shop.settings.logoSource ?? null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
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

  async function onUploadLogo(file: File) {
    setLogoBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shop.slug)}/logo`,
        { method: "POST", credentials: "include", body },
      );
      const data = (await res.json()) as {
        shop?: AdminShop;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setLogoUrl(data.shop?.settings.logoUrl ?? null);
      setLogoSource(data.shop?.settings.logoSource ?? "upload");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSyncLogo() {
    setLogoBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shop.slug)}/logo?sync=1`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as {
        shop?: AdminShop;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not sync logo");
      setLogoUrl(data.shop?.settings.logoUrl ?? null);
      setLogoSource(data.shop?.settings.logoSource ?? "telegram");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function onRemoveLogo() {
    setLogoBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shop.slug)}/logo`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not remove logo");
      setLogoUrl(null);
      setLogoSource(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setLogoBusy(false);
    }
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <form className="admin-panel admin-form" onSubmit={onSubmit}>
      <header className="admin-section-head">
        <div>
          <p className="admin-kicker">Settings</p>
          <h1 className="admin-h1">Shop profile</h1>
          <p className="admin-lead">
            Logo, storefront details, contact, and what you sell.
          </p>
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="admin-success">Saved.</p> : null}

      <p className="admin-kicker">Logo</p>
      <div className="admin-logo-row">
        <div className="admin-logo-preview" aria-hidden>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" />
          ) : (
            <span>{initials || "?"}</span>
          )}
        </div>
        <div className="admin-logo-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUploadLogo(file);
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={logoBusy}
            onClick={() => fileRef.current?.click()}
          >
            {logoBusy ? "Working…" : "Upload logo"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={logoBusy}
            onClick={() => void onSyncLogo()}
          >
            Use channel photo
          </button>
          {logoUrl ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm is-danger"
              disabled={logoBusy}
              onClick={() => void onRemoveLogo()}
            >
              Remove
            </button>
          ) : null}
          <p className="admin-hint">
            {logoSource === "telegram"
              ? "Currently from your connected Telegram channel — upload to replace."
              : logoSource === "upload"
                ? "Custom upload. “Use channel photo” will replace it."
                : "Pulls from the connected channel profile when available."}
          </p>
        </div>
      </div>

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
