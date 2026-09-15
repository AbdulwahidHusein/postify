"use client";

import { useEffect, useRef, useState } from "react";
import { CategoriesMultiSelect } from "@/components/admin/categories-multi-select";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import type { AdminShop } from "@/components/admin/types";

type IngestMode = "auto_publish" | "always_draft" | "paused";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="settings-toggle">
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {hint ? <span className="settings-toggle-hint">{hint}</span> : null}
      </span>
      <span className="settings-toggle-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="settings-toggle-track" aria-hidden>
          <span className="settings-toggle-thumb" />
        </span>
      </span>
    </label>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

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
  const [ingestMode, setIngestMode] = useState<IngestMode>(
    (shop.settings.ingestMode as IngestMode) ?? "auto_publish",
  );
  const [shopVisible, setShopVisible] = useState(
    shop.settings.shopVisible ?? true,
  );
  const [sellerNotifyOrders, setSellerNotifyOrders] = useState(
    shop.settings.sellerNotifyOrders ?? true,
  );
  const [sellerNotifyMessages, setSellerNotifyMessages] = useState(
    shop.settings.sellerNotifyMessages ?? true,
  );
  const [autoArchiveDays, setAutoArchiveDays] = useState<string>(
    shop.settings.autoArchiveDays != null
      ? String(shop.settings.autoArchiveDays)
      : "",
  );

  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

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
            ingestMode,
            shopVisible,
            sellerNotifyOrders,
            sellerNotifyMessages,
            autoArchiveDays: autoArchiveDays.trim()
              ? Math.min(365, Math.max(1, Number(autoArchiveDays)))
              : null,
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
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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

  const ingestHint =
    ingestMode === "paused"
      ? "Channel posts will not create products. Re-enable anytime to resume."
      : ingestMode === "always_draft"
        ? "Every channel post becomes a draft for your review before it goes live."
        : "High-confidence posts publish automatically; weaker ones become drafts.";

  return (
    <form className="settings" onSubmit={onSubmit}>
      <header className="settings-head">
        <div>
          <p className="admin-kicker">Settings</p>
          <h1 className="admin-h1">Shop profile</h1>
          <p className="admin-lead">
            Logo, storefront details, contact, and what you sell.
          </p>
        </div>
        <a
          className="settings-url"
          href={`/s/${shop.slug}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          /s/{shop.slug}
        </a>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      <section className="settings-section">
        <div className="settings-logo">
          <div className="settings-logo-avatar">
            <button
              type="button"
              className="settings-avatar"
              onClick={() => fileRef.current?.click()}
              disabled={logoBusy}
              aria-label={logoUrl ? "Change shop logo" : "Upload shop logo"}
              title={logoUrl ? "Change logo" : "Upload logo"}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" />
              ) : (
                <span className="settings-avatar-fallback">
                  {initials || "?"}
                </span>
              )}
              <span className="settings-avatar-overlay">
                <CameraIcon />
                <span>{logoUrl ? "Change" : "Upload"}</span>
              </span>
            </button>
            {logoUrl ? (
              <button
                type="button"
                className="settings-avatar-remove"
                onClick={() => void onRemoveLogo()}
                disabled={logoBusy}
                aria-label="Remove shop logo"
                title="Remove logo"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
          <div className="settings-logo-meta">
            <p className="settings-logo-title">Shop logo</p>
            <p className="settings-logo-hint">
              Click the photo to upload · JPG, PNG, WebP up to 8MB
            </p>
          </div>
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
        </div>

        <div className="settings-row settings-row-2">
          <label className="settings-field">
            <span>Shop name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="settings-field">
            <span>Default currency</span>
            <input
              className="field"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={8}
              placeholder="ETB"
            />
          </label>
        </div>

        <label className="settings-field">
          <span>Description</span>
          <textarea
            className="field"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="What you sell and who it's for"
          />
        </label>
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2 className="settings-section-title">Storefront contact</h2>
            <p className="settings-section-desc">
              Shown to buyers on your public storefront.
            </p>
          </div>
        </div>
        <label className="settings-field">
          <span>Public Telegram channel</span>
          <input
            className="field"
            value={telegramChannel}
            onChange={(e) => setTelegramChannel(e.target.value)}
            placeholder="@mystore or https://t.me/mystore"
            maxLength={160}
          />
          <span className="admin-hint">
            Separate from the bot-connected channel under Channels.
          </span>
        </label>
        <div className="settings-row settings-row-2">
          <label className="settings-field">
            <span>Owner username (optional)</span>
            <input
              className="field"
              value={ownerUsername}
              onChange={(e) => setOwnerUsername(e.target.value)}
              placeholder="@seller or display name"
              maxLength={80}
            />
          </label>
          <label className="settings-field">
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
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2 className="settings-section-title">Catalog focus</h2>
            <p className="settings-section-desc">
              Helps the bot sort incoming channel listings.
            </p>
          </div>
        </div>
        <CategoriesMultiSelect
          value={sellCategories}
          onChange={setSellCategories}
          disabled={saving}
        />
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2 className="settings-section-title">Channel posting</h2>
            <p className="settings-section-desc">
              How posts in your Telegram channel become products.
            </p>
          </div>
        </div>
        <label className="settings-field">
          <span>Posting mode</span>
          <select
            className="field"
            value={ingestMode}
            onChange={(e) => setIngestMode(e.target.value as IngestMode)}
            disabled={saving}
          >
            <option value="auto_publish">Auto-publish</option>
            <option value="always_draft">Save as draft for review</option>
            <option value="paused">Paused — do not create products</option>
          </select>
          <span className="admin-hint">{ingestHint}</span>
        </label>
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2 className="settings-section-title">Notifications</h2>
            <p className="settings-section-desc">
              Telegram alerts sent to you as the shop owner.
            </p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle
            label="New orders"
            hint="Notify me on Telegram when I get a new order"
            checked={sellerNotifyOrders}
            onChange={setSellerNotifyOrders}
            disabled={saving}
          />
          <Toggle
            label="New messages"
            hint="Notify me on Telegram when I get a new message"
            checked={sellerNotifyMessages}
            onChange={setSellerNotifyMessages}
            disabled={saving}
          />
        </div>
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2 className="settings-section-title">Storefront</h2>
            <p className="settings-section-desc">
              Visibility and automatic archiving.
            </p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle
            label="Shop visible to buyers"
            hint="Uncheck to hide your shop while you set up products."
            checked={shopVisible}
            onChange={setShopVisible}
            disabled={saving}
          />
        </div>
        <label className="settings-field">
          <span>Auto-archive products after N days unsold (optional)</span>
          <input
            className="field"
            inputMode="numeric"
            value={autoArchiveDays}
            onChange={(e) => setAutoArchiveDays(e.target.value)}
            placeholder="Leave empty to disable"
            maxLength={3}
            disabled={saving}
          />
          <span className="admin-hint">
            Published products older than this move to archived automatically.
          </span>
        </label>
      </section>

      <div className="settings-savebar">
        <p className="settings-save-hint" aria-live="polite">
          {saved ? "Saved ✓" : "Slug is fixed after create · /s/" + shop.slug}
        </p>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || logoBusy}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
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
