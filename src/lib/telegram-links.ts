/** Public or private channel post deep link. */
export function telegramMessageUrl(input: {
  username?: string | null;
  chatId?: bigint | string | null;
  messageId?: number | null;
}): string | null {
  if (input.messageId == null || input.messageId <= 0) return null;

  const username = input.username?.replace(/^@/, "").trim();
  if (username) {
    return `https://t.me/${username}/${input.messageId}`;
  }

  if (input.chatId == null || input.chatId === "") return null;
  const raw = String(input.chatId);
  // Supergroup / channel ids are typically -100xxxxxxxxxx
  if (raw.startsWith("-100")) {
    return `https://t.me/c/${raw.slice(4)}/${input.messageId}`;
  }
  return null;
}

export function buildProductChannelCaption(product: {
  title: string;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
}): string {
  const lines: string[] = [product.title.trim()];
  if (product.price != null && product.price !== "") {
    const amount = Number(product.price);
    if (Number.isFinite(amount)) {
      lines.push(
        `${product.currency || "ETB"} ${amount.toLocaleString()}`,
      );
    }
  }
  if (product.description?.trim()) {
    lines.push("", product.description.trim().slice(0, 800));
  }
  return lines.join("\n").slice(0, 1024);
}
