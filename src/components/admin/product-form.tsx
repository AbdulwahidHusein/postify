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
import { CatalogTypeahead } from "@/components/admin/catalog-typeahead";
import { SuggestSelect } from "@/components/admin/suggest-select";
import { TagsInput } from "@/components/admin/tags-input";
import { useShopAdmin } from "@/components/admin/shop-admin-context";
import type { AdminProduct } from "@/components/admin/types";
import {
  COMMON_CONDITIONS,
  mergeOptions,
} from "@/lib/catalog/field-options";
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
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [brandsTruncated, setBrandsTruncated] = useState(false);
  const [modelsTruncated, setModelsTruncated] = useState(false);
  const [brandsTotal, setBrandsTotal] = useState(0);
  const [modelsTotal, setModelsTotal] = useState(0);
  const [conditionOptions, setConditionOptions] = useState<string[]>(
    COMMON_CONDITIONS,
  );
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [postNote, setPostNote] = useState<string | null>(null);

  const channelConnected = channels.length > 0;

  // Load Brand + Condition from form_fields when category changes (capped; typeahead searches remotely).
  useEffect(() => {
    const category = form.category.trim();
    if (!category) {
      setBrandOptions([]);
      setModelOptions([]);
      setBrandsTruncated(false);
      setModelsTruncated(false);
      setBrandsTotal(0);
      setModelsTotal(0);
      setConditionOptions(COMMON_CONDITIONS);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/catalog/form-fields?category=${encodeURIComponent(category)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          brands?: string[];
          brandsTotal?: number;
          brandsTruncated?: boolean;
          conditions?: string[];
        };
        if (cancelled) return;
        // Never fall back to the tiny hardcoded group list — that showed
        // "15 vehicle brands" and hid the real mined catalog.
        setBrandOptions(data.brands ?? []);
        setBrandsTotal(data.brandsTotal ?? data.brands?.length ?? 0);
        setBrandsTruncated(Boolean(data.brandsTruncated));
        setConditionOptions(
          mergeOptions(data.conditions, COMMON_CONDITIONS),
        );
      } catch {
        if (!cancelled) {
          setBrandOptions([]);
          setBrandsTotal(0);
          setBrandsTruncated(false);
          setConditionOptions(COMMON_CONDITIONS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.category]);

  // Load Model options when Brand changes (capped; large lists use remote typeahead).
  useEffect(() => {
    const category = form.category.trim();
    const brand = form.brand.trim();
    if (!category || !brand) {
      setModelOptions([]);
      setModelsTruncated(false);
      setModelsTotal(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/catalog/form-fields?category=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          models?: string[];
          modelsTotal?: number;
          modelsTruncated?: boolean;
        };
        if (!cancelled) {
          setModelOptions(data.models ?? []);
          setModelsTotal(data.modelsTotal ?? data.models?.length ?? 0);
          setModelsTruncated(Boolean(data.modelsTruncated));
        }
      } catch {
        if (!cancelled) {
          setModelOptions([]);
          setModelsTotal(0);
          setModelsTruncated(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.category, form.brand]);

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
      attributes: (() => {
        const cleaned = Object.fromEntries(
          Object.entries(attributes).filter(([, v]) => v.trim()),
        );
        return Object.keys(cleaned).length > 0 ? cleaned : null;
      })(),
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
    <form className="admin-editor product-editor" onSubmit={onSubmit}>
      <div className="admin-editor-main">
        <header className="product-editor-head">
          <div>
            <p className="admin-kicker">
              {isEdit ? "Edit product" : "New product"}
            </p>
            <h1 className="admin-h1">
              {isEdit ? form.title || "Untitled" : "Create listing"}
            </h1>
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

        <section className="admin-panel product-editor-sheet">
          {isEdit && form.status === "draft" ? (
            <div className="admin-banner admin-banner-wait">
              <div>
                <strong>Draft</strong>
                <p>Not visible until published.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Publish
              </button>
            </div>
          ) : null}

          {isEdit && form.status === "published" ? (
            <div className="admin-banner admin-banner-live">
              <div>
                <strong>Live</strong>
                <p>Visible in your shop.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("sold")}
              >
                Mark sold
              </button>
            </div>
          ) : null}

          {isEdit && form.status === "sold" ? (
            <div className="admin-banner admin-banner-sold">
              <div>
                <strong>Sold</strong>
                <p>Hidden from the catalog.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Relist
              </button>
            </div>
          ) : null}

          {isEdit && form.status === "archived" ? (
            <div className="admin-banner admin-banner-wait">
              <div>
                <strong>Archived</strong>
                <p>Hidden from buyers.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => void applyStatus("published")}
              >
                Restore
              </button>
            </div>
          ) : null}

          <div className="product-editor-section">
            <h2 className="product-editor-section-title">Photos</h2>
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

          <div className="product-editor-section">
            <h2 className="product-editor-section-title">Basics</h2>
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
                placeholder="e.g. Toyota Corolla 2018"
              />
            </label>

            <div className="product-editor-row product-editor-row-price">
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
              <label className="admin-field product-editor-currency">
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
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="sold">Sold</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>

            <label className="admin-field">
              <span>Description</span>
              <textarea
                className="field"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                maxLength={4000}
                placeholder="Condition, key specs, what’s included…"
              />
            </label>
          </div>

          <div className="product-editor-section">
            <h2 className="product-editor-section-title">Category & specs</h2>
            <CategoryCombobox
              value={form.category}
              onChange={(category) => setForm((f) => ({ ...f, category }))}
              disabled={saving}
            />

            <div className="product-editor-row">
              <CatalogTypeahead
                label="Brand"
                kind="brand"
                category={form.category}
                value={form.brand}
                options={brandOptions}
                truncated={brandsTruncated}
                totalCount={brandsTotal}
                onChange={(brand) =>
                  setForm((f) => ({
                    ...f,
                    brand,
                    model: brand === f.brand ? f.model : "",
                  }))
                }
                disabled={saving || !form.category.trim()}
                placeholder={
                  form.category.trim()
                    ? "Type to search brand…"
                    : "Pick a category first"
                }
              />
              <CatalogTypeahead
                label="Model"
                kind="model"
                category={form.category}
                brand={form.brand}
                value={form.model}
                options={modelOptions}
                truncated={modelsTruncated}
                totalCount={modelsTotal}
                onChange={(model) => setForm((f) => ({ ...f, model }))}
                disabled={saving || !form.brand.trim()}
                placeholder={
                  form.brand.trim() ? "Type to search model…" : "Pick a brand first"
                }
              />
            </div>

            <div className="product-editor-row">
              <SuggestSelect
                label="Condition"
                value={form.condition}
                options={conditionOptions}
                onChange={(condition) =>
                  setForm((f) => ({ ...f, condition }))
                }
                disabled={saving}
                placeholder="Select condition…"
              />
              <RegionSelect
                value={form.location}
                onChange={(location) => setForm((f) => ({ ...f, location }))}
                disabled={saving}
              />
            </div>
          </div>

          <details className="product-editor-more" open={Boolean(form.category.trim())}>
            <summary>More details</summary>
            <div className="product-editor-more-body">
              {form.category ? (
                <CategoryAttributes
                  category={form.category}
                  values={attributes}
                  onChange={setAttributes}
                  disabled={saving}
                />
              ) : (
                <p className="admin-muted">
                  Pick a category to see fields like RAM, screen size, year…
                </p>
              )}

              <div className="product-editor-row">
                <label className="admin-field">
                  <span>Compare-at price</span>
                  <input
                    className="field"
                    inputMode="decimal"
                    value={form.compareAtPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        compareAtPrice: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="admin-field">
                  <span>SKU</span>
                  <input
                    className="field"
                    value={form.sku}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={64}
                  />
                </label>
                <label className="admin-field">
                  <span>Stock</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={form.stockQuantity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        stockQuantity: e.target.value,
                      }))
                    }
                    placeholder="Unlimited"
                  />
                </label>
              </div>

              <TagsInput
                value={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                disabled={saving}
              />

              <label className="admin-field admin-field-inline product-editor-check">
                <input
                  type="checkbox"
                  checked={form.isNegotiable}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      isNegotiable: e.target.checked,
                    }))
                  }
                  disabled={saving}
                />
                <span>Price is negotiable</span>
              </label>

              <label className="admin-field">
                <span>Shipping / pickup</span>
                <input
                  className="field"
                  value={form.shippingInfo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shippingInfo: e.target.value }))
                  }
                  placeholder="Optional"
                  maxLength={500}
                />
              </label>
              <label className="admin-field">
                <span>Return policy</span>
                <input
                  className="field"
                  value={form.returnPolicy}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, returnPolicy: e.target.value }))
                  }
                  placeholder="Optional"
                  maxLength={500}
                />
              </label>
            </div>
          </details>

          <div className="product-editor-actions">
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
        </section>

        {(isEdit && fromChannel) || telegramUrl ? (
          <section className="admin-panel product-editor-meta">
            <h2 className="product-editor-section-title">Telegram</h2>
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
              <p className="admin-muted">Imported from Telegram.</p>
            )}
            {rawCaption ? (
              <pre className="admin-raw-caption">{rawCaption}</pre>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside className="admin-editor-aside admin-panel product-editor-preview">
        <p className="admin-kicker">Preview</p>
        <div className="admin-preview-media">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" />
          ) : (
            <span className="admin-muted">No photo yet</span>
          )}
        </div>
        <h2 className="admin-h2">{form.title || "Untitled"}</h2>
        <div className="preview-price-row">
          <p className="admin-price">{pricePreview}</p>
          {comparePreview ? (
            <p className="preview-compare">{comparePreview}</p>
          ) : null}
        </div>
        {(form.brand || form.model || form.category) && (
          <p className="admin-muted">
            {[form.brand, form.model, form.category]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {Object.entries(attributes).filter(([, v]) => v.trim()).length > 0 ? (
          <dl className="admin-preview-attrs">
            {Object.entries(attributes)
              .filter(([, v]) => v.trim())
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        ) : null}
        {slug && (form.status === "published" || form.status === "sold") ? (
          <Link href={`/p/${slug}`} className="btn btn-ghost btn-sm">
            Open public page
          </Link>
        ) : null}
      </aside>
    </form>
  );
}
