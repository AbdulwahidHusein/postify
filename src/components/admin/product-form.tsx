"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductImageGallery } from "@/components/admin/product-image-gallery";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import { TagsInput } from "@/components/admin/tags-input";
import type { AdminProduct } from "@/components/admin/types";

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
  status: "draft",
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
  const isEdit = Boolean(productId);
  const [form, setForm] = useState<FormState>(emptyForm(defaultCurrency));
  const [images, setImages] = useState<AdminProduct["images"]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(productId ?? null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [rawCaption, setRawCaption] = useState<string | null>(null);
  const [sourceMessageId, setSourceMessageId] = useState<number | null>(null);
  const [fromChannel, setFromChannel] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

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
          status: p.status,
        });
        setImages(p.images);
        setSlug(p.slug);
        setCurrentId(p.id);
        setConfidence(p.confidence);
        setRawCaption(p.rawCaption ?? null);
        setSourceMessageId(p.sourceMessageId ?? null);
        setFromChannel(Boolean(p.channelId || p.rawCaption || p.sourceMessageId));
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
      status: form.status,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    setSavedNote(false);

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
        if (data.product) {
          router.replace(
            `/dashboard/s/${shopSlug}/products/${data.product.id}`,
          );
          return;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
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
    return <p className="admin-loading">Loading product…</p>;
  }

  const cover = images[0];
  const pricePreview =
    form.price.trim() === ""
      ? "Price on request"
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
                Details, pricing, inventory, and gallery in one place.
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

          {isEdit && form.status === "draft" ? (
            <section className="admin-banner admin-banner-wait">
              <div>
                <strong>Draft — needs review</strong>
                <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                  Fix details if needed, then publish to the storefront.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => {
                  setForm((f) => ({ ...f, status: "published" }));
                  setSavedNote(false);
                }}
              >
                Ready to publish
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

          <label className="admin-field">
            <span>Description</span>
            <textarea
              className="field"
              rows={6}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              maxLength={4000}
              placeholder="Condition, size, materials, what’s included…"
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
                <option value="draft">Draft</option>
                <option value="published">Published</option>
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

          <div className="admin-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create & add photos"}
            </button>
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
          {!isEdit ? (
            <p className="admin-hint">
              Create the listing first, then you’ll upload a multi-image gallery
              on the next screen.
            </p>
          ) : null}
        </section>

        {currentId ? (
          <div className="admin-panel">
            <ProductImageGallery
              productId={currentId}
              images={images}
              onChange={(product) => {
                setImages(product.images);
                setSlug(product.slug);
              }}
            />
          </div>
        ) : null}

        {isEdit && fromChannel ? (
          <section className="admin-panel">
            <p className="admin-kicker">Channel source</p>
            <h2 className="admin-h2">Import details</h2>
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
            </dl>
            {rawCaption ? (
              <>
                <p className="admin-hint">Original caption</p>
                <pre className="admin-raw-caption">{rawCaption}</pre>
              </>
            ) : (
              <p className="admin-muted">No caption captured.</p>
            )}
          </section>
        ) : null}
      </div>

      <aside className="admin-editor-aside admin-panel">
        <p className="admin-kicker">Live preview</p>
        <div className="admin-preview-media">
          {cover?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.src} alt="" />
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
        {slug && form.status === "published" ? (
          <Link href={`/p/${slug}`} className="btn btn-ghost btn-sm">
            Open public page
          </Link>
        ) : null}
      </aside>
    </form>
  );
}
