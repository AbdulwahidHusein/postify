export type ParsedListing = {
  isProduct: boolean;
  confidence: number;
  title: string;
  description: string;
  price: number | null;
  currency: string | null;
};

const PRICE_RE =
  /(?:^|\s)(?:price[:\s]*)?(?:ETB|ብር|birr|usd|\$|eur|€)?\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:ETB|ብር|birr|usd|\$|eur|€)?(?:\s|$)/i;

export function parseListingCaption(
  caption: string,
  opts?: { defaultCurrency?: string; hasMedia?: boolean },
): ParsedListing {
  const raw = caption.trim();
  const defaultCurrency = opts?.defaultCurrency ?? "ETB";
  const hasMedia = Boolean(opts?.hasMedia);

  if (!raw && !hasMedia) {
    return {
      isProduct: false,
      confidence: 0,
      title: "Untitled",
      description: "",
      price: null,
      currency: null,
    };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const priceMatch = raw.match(PRICE_RE);
  let price: number | null = null;
  let currency: string | null = null;

  if (priceMatch) {
    const num = priceMatch[1].replace(/[,\s]/g, "");
    const parsed = Number(num);
    if (Number.isFinite(parsed)) {
      price = parsed;
      const around = priceMatch[0].toUpperCase();
      if (around.includes("USD") || around.includes("$")) currency = "USD";
      else if (around.includes("EUR") || around.includes("€")) currency = "EUR";
      else currency = defaultCurrency;
    }
  }

  const title =
    lines[0]?.replace(PRICE_RE, "").trim() ||
    (hasMedia ? "Channel listing" : "Untitled");

  const description = lines.slice(1).join("\n").trim() || raw;

  const isProduct = hasMedia || price !== null || title.length >= 3;
  const confidence =
    hasMedia && price !== null ? 0.85 : hasMedia ? 0.7 : price !== null ? 0.6 : 0.4;

  return {
    isProduct,
    confidence,
    title: title.slice(0, 120) || "Channel listing",
    description: description.slice(0, 2000),
    price,
    currency: currency ?? defaultCurrency,
  };
}
