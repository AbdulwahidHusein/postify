/**
 * Pure, dependency-free rules used before any paid work happens.
 * Kept separate so they are trivially unit-testable.
 */

const CURRENCY_NEAR_NUMBER =
  /(?:\d[\d,.\s]*\s*(?:etb|birr|br\.?|ብር|\$|usd|eur|€))|(?:(?:etb|birr|ብር|\$|usd|€)\s*\d)/i;
const PRICE_KEYWORD = /(?:price|ዋጋ|cost|ብቻ)\s*[:\-=]?\s*\d/i;
/** Ethiopian phone numbers must not count as prices. */
const PHONE = /(?:\+?251|0)9\d{8}|(?:\+?251|0)7\d{8}/g;

export function hasPriceLike(caption: string): boolean {
  if (!caption) return false;
  const text = caption.replace(PHONE, " ");
  if (CURRENCY_NEAR_NUMBER.test(text) || PRICE_KEYWORD.test(text)) return true;
  // A standalone number of 3-9 digits (e.g. "4500", "45,000") is a price hint.
  return /(?:^|\s)\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s|$)|(?:^|\s)\d{3,9}(?:\s|$)/.test(text);
}

/** Free prefilter: the AI never sees posts without a photo or a price. */
export function looksLikeListing(input: { caption: string; photoCount: number }): boolean {
  return input.photoCount > 0 || hasPriceLike(input.caption);
}

export function normalizeCaption(caption: string): string {
  return caption.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/** Parse a seller's price reply ("4500", "4,500 birr", "ETB 4500.50"). */
export function parsePriceReply(text: string): number | null {
  const cleaned = text.replace(PHONE, " ").trim();
  const m = /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(cleaned);
  if (!m) return null;
  const whole = Number(m[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(whole) || whole <= 0 || whole > 1_000_000_000) return null;
  return m[2] ? Number(`${whole}.${m[2]}`) : whole;
}

/** "sold" / "ተሽጧል" in an edited caption marks the item sold. */
export function captionSaysSold(caption: string): boolean {
  return /(?:^|\s|#)(sold(?:\s*out)?|ተሽጧል|ተሸጧል)(?:\s|$|[.!])/i.test(caption);
}

export function telegramGroupKey(input: {
  chatId: bigint | number | string;
  messageId: number;
  mediaGroupId?: string | null;
}): string {
  return input.mediaGroupId
    ? `${input.chatId}:g:${input.mediaGroupId}`
    : `${input.chatId}:m:${input.messageId}`;
}
