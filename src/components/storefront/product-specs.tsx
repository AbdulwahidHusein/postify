import {
  buildProductSpecRows,
  type ProductSpecRow,
} from "@/lib/product-specs";

type Props = {
  product: {
    category?: string | null;
    condition?: string | null;
    brand?: string | null;
    model?: string | null;
    location?: string | null;
    attributes?: Record<string, string> | null;
  };
  /** Exclude category from the table when already shown above. */
  hideCategory?: boolean;
  title?: string;
};

export function ProductSpecs({
  product,
  hideCategory = true,
  title = "Details",
}: Props) {
  let rows: ProductSpecRow[] = buildProductSpecRows(product);
  if (hideCategory) {
    rows = rows.filter((r) => r.label.toLowerCase() !== "category");
  }
  if (!rows.length) return null;

  return (
    <section className="buy-details" aria-labelledby="buy-details-heading">
      <h2 id="buy-details-heading" className="buy-details-title">
        {title}
      </h2>
      <dl className="buy-specs">
        {rows.map((row) => (
          <div className="buy-spec-row" key={`${row.label}:${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
