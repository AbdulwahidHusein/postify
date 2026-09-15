"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ProductImageGallery,
  type PendingImage,
} from "@/components/admin/product-image-gallery";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import { CategoryAttributes } from "@/components/admin/category-attributes";
import { RegionSelect } from "@/components/admin/region-select";
import { TagsInput } from "@/components/admin/tags-input";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import type { AdminProduct } from "@/components/admin/types";
import { telegramMessageUrl } from "@/lib/telegram-links";
import { PageLoader } from "@/components/ui/loader";

type FormState = {
  title: string;
  description: string;
  price: string;
  compareAtPrice: string;
  currency: string;
  category: string;
  sku: string;
  stockQuantity: string;
  tags: string;
  condition: string;
  brand: string;
  model: string;
  location: string;
  isNegotiable: boolean;
  shippingInfo: string;
  returnPolicy: string;
  status: AdminProduct["status"];
};

const emptyForm = (currency: string): FormState => ({
  title: "",
  description: "",
  price: "",
  compareAtPrice: "",
  currency,
  category: "",
  sku: "",
  stockQuantity: "",
  tags: "",
  condition: "",
  brand: "",
  model: "",
  location: "",
  isNegotiable: false,
  shippingInfo: "",
  returnPolicy: "",
  status: "published",
});

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function ProductForm({
  shopSlug,
  defaultCurrency,
  productId,
}: {
  shopSlug: string;
  defaultCurrency: string;
  productId?: string;
}) {
  const router = useRouter();
  const { channels } = useShopAdmin();
  const isEdit = Boolean(productId);
  const [form, setForm] = useState<FormState>(emptyForm(defaultCurrency));
  const [images, setImages] = useState<AdminProduct["images"]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingImage[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(productId ?? null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [rawCaption, setRawCaption] = useState<string | null>(null);
  const [sourceChatId, setSourceChatId] = useState<string | null>(null);
  const [sourceMessageId, setSourceMessageId] = useState<number | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [fromChannel, setFromChannel] = useState(false);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [postNote, setPostNote] = useState<string | null>(null);

  const channelConnected = channels.length > 0;

  async function applyStatus(next: AdminProduct["status"]) {
    if (!currentId) {
      setForm((f) => ({ ...f, status: next }));
      return;
    }
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const res = await fetch(`/api/products/${currentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as {
        product?: AdminProduct;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not update status");
      setForm((f) => ({ ...f, status: next }));
      setSavedNote(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/products/${productId}`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          product?: AdminProduct;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load product");
        if (cancelled || !data.product) return;
        const p = data.product;
        setForm({
          title: p.title,
          description: p.description ?? "",
          price: p.price != null ? String(p.price) : "",
          compareAtPrice:
            p.compareAtPrice != null ? String(p.compareAtPrice) : "",
          currency: p.currency,
          category: p.category ?? "",
          sku: p.sku ?? "",
          stockQuantity:
            p.stockQuantity != null ? String(p.stockQuantity) : "",
          tags: p.tags ?? "",
          condition: p.condition ?? "",
          brand: p.brand ?? "",
          model: p.model ?? "",
          location: p.location ?? "",
          isNegotiable: p.isNegotiable ?? false,
          shippingInfo: p.shippingInfo ?? "",
          returnPolicy: p.returnPolicy ?? "",
          status: p.status,
        });
        setImages(p.images);
        setSlug(p.slug);
        setCurrentId(p.id);
        setConfidence(p.confidence);
        setRawCaption(p.rawCaption ?? null);
        setSourceChatId(p.sourceChatId ?? null);
        setSourceMessageId(p.sourceMessageId ?? null);
        setTelegramUrl(p.telegramUrl ?? null);
        setFromChannel(Boolean(p.channelId || p.rawCaption || p.sourceMessageId));
        setAttributes(p.attributes ?? {});
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function buildPayload() {
    const price = parseOptionalNumber(form.price);
    const compareAtPrice = parseOptionalNumber(form.compareAtPrice);
    const stockRaw = form.stockQuantity.trim();
    const stockQuantity =
      stockRaw === "" ? null : Number.parseInt(stockRaw, 10);

    if (Number.isNaN(price) || Number.isNaN(compareAtPrice)) {
      throw new Error("Enter valid prices");
    }
    if (stockRaw !== "" && !Number.isFinite(stockQuantity)) {
      throw new Error("Enter a valid stock quantity");
    }

    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      price,
      compareAtPrice,
      currency: form.currency.trim() || defaultCurrency,
      category: form.category.trim() || null,
      sku: form.sku.trim() || null,
      stockQuantity,
      tags: form.tags.trim() || null,
      condition: form.condition.trim() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      location: form.location.trim() || null,
      isNegotiable: form.isNegotiable,
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
      shippingInfo: form.shippingInfo.trim() || null,
      returnPolicy: form.returnPolicy.trim() || null,
      status: form.status,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    setSavedNote(false);
    setPostNote(null);

    try {
      const payload = buildPayload();

      if (isEdit && productId) {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as {
          product?: AdminProduct;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not save");
        if (data.product) {
          setSlug(data.product.slug);
          setImages(data.product.images);
          setSavedNote(true);
        }
      } else {
        const res = await fetch(
          `/api/shops/${encodeURIComponent(shopSlug)}/products`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await res.json()) as {
          product?: AdminProduct;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not create");
        if (!data.product) throw new Error("Could not create");

        const createdId = data.product.id;
        for (const pending of pendingFiles) {
          const body = new FormData();
          body.append("file", pending.file);
          const imgRes = await fetch(`/api/products/${createdId}/images`, {
            method: "POST",
            credentials: "include",
            body,
          });
          if (!imgRes.ok) {
            const imgData = (await imgRes.json()) as { error?: string };
            throw new Error(
              imgData.error ?? "Product saved but a photo failed to upload",
            );
          }
        }
        for (const pending of pendingFiles) {
          URL.revokeObjectURL(pending.previewUrl);
        }
        setPendingFiles([]);
        router.replace(`/dashboard/s/${shopSlug}/products/${createdId}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onPostToTelegram() {
    if (!currentId) return;
    setPosting(true);
    setError(null);
    setPostNote(null);
    try {
      const res = await fetch(
        `/api/products/${currentId}/post-to-channel`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as {
        product?: AdminProduct;
        telegramUrl?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not post");
      if (data.product) {
        setSourceChatId(data.product.sourceChatId ?? null);
        setSourceMessageId(data.product.sourceMessageId ?? null);
        setTelegramUrl(
          data.telegramUrl ??
            data.product.telegramUrl ??
            telegramMessageUrl({
              username: channels[0]?.username,
              chatId: data.product.sourceChatId,
              messageId: data.product.sourceMessageId,
            }),
        );
        setFromChannel(true);
      }
      setPostNote("Posted to Telegram with Open in Goods on the message.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function onDelete() {
    if (!productId || !confirm("Permanently delete this product?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      router.push(`/dashboard/s/${shopSlug}/products`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader label="Loading product" />;
  }

  const cover = images[0];
  const pendingCover = pendingFiles[0];
  const coverSrc = cover?.src ?? pendingCover?.previewUrl ?? null;
  const pricePreview =
    form.price.trim() === ""
      ? "Ask for price"
      : `${form.currency} ${Number(form.price.replace(/,/g, "") || 0).toLocaleString()}`;
  const comparePreview =
    form.compareAtPrice.trim() === ""
      ? null
      : `${form.currency} ${Number(form.compareAtPrice.replace(/,/g, "") || 0).toLocaleString()}`;

  return (
    <form className="admin-editor" onSubmit={onSubmit}>
      <div className="admin-editor-main admin-stack">
        <section className="admin-panel admin-form">
          <header className="admin-section-head">
            <div>
              <p className="admin-kicker">
                {isEdit ? "Edit product" : "New product"}
              </p>
              <h1 className="admin-h1">
                {isEdit ? form.title || "Untitled" : "Create listing"}
              </h1>
              <p className="admin-lead">
                Photos first, then details — save once when you’re ready.
              </p>
            </div>
            <Link
              href={`/dashboard/s/${shopSlug}/products`}
              className="btn btn-ghost btn-sm"
            >
              Back
            </Link>
          </header>

          {error ? <p className="admin-error">{error}</p> : null}
          {savedNote ? <p className="admin-success">Saved.</p> : null}
        </section>

        <div className="admin-panel">
          <ProductImageGallery
            productId={currentId}
            images={images}
            pendingFiles={pendingFiles}
            onPendingChange={setPendingFiles}
            onChange={(product) => {
              setImages(product.images);
              setSlug(product.slug);
            }}
          />
        </div>

        <section className="admin-panel admin-form">
          {isEdit && form.status === "draft" ? (
            <section className="admin-banner admin-banner-wait">
              <div>
                <strong>Draft</strong>
                <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                  Not visible on the storefront until published.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Publish
              </button>
            </section>
          ) : null}

          {isEdit && form.status === "published" ? (
            <section className="admin-banner admin-banner-live">
              <div>
                <strong>Live on your shop</strong>
                <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                  When it sells, mark it sold — it leaves the catalog but keeps
                  its link.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("sold")}
              >
                Mark sold
              </button>
            </section>
          ) : null}

          {isEdit && form.status === "sold" ? (
            <section className="admin-banner admin-banner-sold">
              <div>
                <strong>Sold</strong>
                <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                  Hidden from the shop catalog. Shared links still open with a
                  Sold badge.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Relist
              </button>
            </section>
          ) : null}

          {isEdit && form.status === "archived" ? (
            <section className="admin-banner admin-banner-wait">
              <div>
                <strong>Archived</strong>
                <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                  Hidden from buyers. Restore to put it back on the shop.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Restore
              </button>
            </section>
          ) : null}

          <label className="admin-field">
            <span>Title</span>
            <input
              className="field"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              required
              maxLength={120}
              placeholder="Nike Air Force 1 — White"
            />
          </label>

          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Price</span>
              <input
                className="field"
                inputMode="decimal"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                placeholder="4500"
              />
            </label>
            <label className="admin-field">
              <span>Currency</span>
              <input
                className="field"
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value }))
                }
                maxLength={8}
              />
            </label>
          </div>

          <label className="admin-field">
            <span>Description</span>
            <textarea
              className="field"
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              maxLength={4000}
              placeholder="Condition, size, materials…"
            />
          </label>

          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Compare-at price</span>
              <input
                className="field"
                inputMode="decimal"
                value={form.compareAtPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, compareAtPrice: e.target.value }))
                }
                placeholder="Optional original price"
              />
            </label>
            <label className="admin-field">
              <span>Status</span>
              <select
                className="field"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as AdminProduct["status"],
                  }))
                }
              >
                <option value="published">Published (live)</option>
                <option value="draft">Draft</option>
                <option value="sold">Sold</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <div className="admin-form-grid">
            <CategoryCombobox
              value={form.category}
              onChange={(category) => setForm((f) => ({ ...f, category }))}
              disabled={saving}
            />
            <label className="admin-field">
              <span>SKU</span>
              <input
                className="field"
                value={form.sku}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sku: e.target.value }))
                }
                placeholder="AF1-WHT-42"
                maxLength={64}
              />
            </label>
            <label className="admin-field">
              <span>Stock quantity</span>
              <input
                className="field"
                inputMode="numeric"
                value={form.stockQuantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stockQuantity: e.target.value }))
                }
                placeholder="Leave empty if unlimited"
              />
            </label>
            <div className="admin-field-span">
              <TagsInput
                value={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Condition</span>
              <input
                className="field"
                list="condition-suggestions"
                value={form.condition}
                onChange={(e) =>
                  setForm((f) => ({ ...f, condition: e.target.value }))
                }
                placeholder="Brand New, Used, Refurbished…"
                maxLength={60}
              />
              <datalist id="condition-suggestions">
                <option value="Brand New" />
                <option value="New" />
                <option value="Local Used" />
                <option value="Foreign Used" />
                <option value="Used" />
                <option value="Like New" />
                <option value="Good" />
                <option value="Fair" />
                <option value="Refurbished" />
              </datalist>
            </label>
            <label className="admin-field">
              <span>Brand</span>
              <input
                className="field"
                value={form.brand}
                onChange={(e) =>
                  setForm((f) => ({ ...f, brand: e.target.value }))
                }
                placeholder="Samsung, Nike, Toyota…"
                maxLength={80}
              />
            </label>
            <label className="admin-field">
              <span>Model</span>
              <input
                className="field"
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
                placeholder="Galaxy S23, Air Force 1…"
                maxLength={120}
              />
            </label>
          </div>

          <RegionSelect
            value={form.location}
            onChange={(location) => setForm((f) => ({ ...f, location }))}
            disabled={saving}
          />

          {form.category ? (
            <CategoryAttributes
              category={form.category}
              values={attributes}
              onChange={setAttributes}
              disabled={saving}
            />
          ) : null}

          <label className="admin-field admin-field-inline">
            <input
              type="checkbox"
              checked={form.isNegotiable}
              onChange={(e) =>
                setForm((f) => ({ ...f, isNegotiable: e.target.checked }))
              }
              disabled={saving}
            />
            <span>Price is negotiable</span>
          </label>

          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Shipping / pickup info (optional)</span>
              <input
                className="field"
                value={form.shippingInfo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shippingInfo: e.target.value }))
                }
                placeholder="Free delivery in Addis, pickup in Bole…"
                maxLength={500}
              />
            </label>
            <label className="admin-field">
              <span>Return policy (optional)</span>
              <input
                className="field"
                value={form.returnPolicy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, returnPolicy: e.target.value }))
                }
                placeholder="7-day returns, no returns…"
                maxLength={500}
              />
            </label>
          </div>

          <div className="admin-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving
                ? pendingFiles.length
                  ? "Saving & uploading…"
                  : "Saving…"
                : isEdit
                  ? "Save changes"
                  : pendingFiles.length
                    ? `Save with ${pendingFiles.length} photo${pendingFiles.length === 1 ? "" : "s"}`
                    : "Save product"}
            </button>
            {isEdit && currentId && channelConnected ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving || posting}
                onClick={() => void onPostToTelegram()}
              >
                {posting
                  ? "Posting…"
                  : sourceMessageId
                    ? "Re-post to Telegram"
                    : "Post to Telegram"}
              </button>
            ) : null}
            {telegramUrl ? (
              <a
                href={telegramUrl}
                className="btn btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Telegram
              </a>
            ) : null}
            {isEdit ? (
              <button
                type="button"
                className="btn btn-ghost is-danger"
                disabled={saving}
                onClick={() => void onDelete()}
              >
                Delete
              </button>
            ) : null}
          </div>
          {postNote ? <p className="admin-success">{postNote}</p> : null}
          {!isEdit ? (
            <p className="admin-hint">
              Add photos above, fill in the details, then save once.
            </p>
          ) : !channelConnected ? (
            <p className="admin-hint">
              Connect a channel to post this product to Telegram with an Open in
              shop button.
            </p>
          ) : null}
        </section>

        {(isEdit && fromChannel) || telegramUrl ? (
          <section className="admin-panel">
            <p className="admin-kicker">Telegram</p>
            <h2 className="admin-h2">Channel link</h2>
            {telegramUrl ? (
              <p className="admin-muted">
                Linked to a channel post.{" "}
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on Telegram
                </a>
              </p>
            ) : (
              <p className="admin-muted">
                Imported from Telegram (private link unavailable without a
                public @username).
              </p>
            )}
            <dl className="admin-meta-list">
              {confidence != null ? (
                <>
                  <dt>Confidence</dt>
                  <dd>{(confidence * 100).toFixed(0)}%</dd>
                </>
              ) : null}
              {sourceMessageId != null ? (
                <>
                  <dt>Message id</dt>
                  <dd className="admin-mono">{sourceMessageId}</dd>
                </>
              ) : null}
              {sourceChatId ? (
                <>
                  <dt>Chat id</dt>
                  <dd className="admin-mono">{sourceChatId}</dd>
                </>
              ) : null}
            </dl>
            {rawCaption ? (
              <>
                <p className="admin-hint">Original caption</p>
                <pre className="admin-raw-caption">{rawCaption}</pre>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside className="admin-editor-aside admin-panel">
        <p className="admin-kicker">Live preview</p>
        <div className="admin-preview-media">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" />
          ) : (
            <span className="admin-muted">No cover image yet</span>
          )}
        </div>
        {images.length > 1 ? (
          <div className="preview-thumbs">
            {images.slice(0, 5).map((img) =>
              img.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.src} alt="" />
              ) : null,
            )}
          </div>
        ) : null}
        <h2 className="admin-h2">{form.title || "Untitled product"}</h2>
        <div className="preview-price-row">
          <p className="admin-price">{pricePreview}</p>
          {comparePreview ? (
            <p className="preview-compare">{comparePreview}</p>
          ) : null}
        </div>
        {form.category || form.sku ? (
          <p className="admin-muted">
            {[form.category, form.sku ? `SKU ${form.sku}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {form.stockQuantity.trim() ? (
          <p className="admin-muted">{form.stockQuantity} in stock</p>
        ) : null}
        {form.description ? (
          <p className="admin-muted admin-pre">{form.description}</p>
        ) : (
          <p className="admin-muted">Description will appear here.</p>
        )}
        {form.tags.trim() ? (
          <div className="preview-tags">
            {form.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tag) => (
                <span key={tag} className="admin-chip">
                  {tag}
                </span>
              ))}
          </div>
        ) : null}
        {slug && (form.status === "published" || form.status === "sold") ? (
          <Link href={`/p/${slug}`} className="btn btn-ghost btn-sm">
            {form.status === "sold" ? "Open sold page" : "Open public page"}
          </Link>
        ) : null}
        {isEdit && currentId ? (
          <Link
            href={`/dashboard/s/${shopSlug}/inbox?productId=${currentId}`}
            className="btn btn-ghost btn-sm"
          >
            Messages
          </Link>
        ) : null}
      </aside>
    </form>
  );
}
