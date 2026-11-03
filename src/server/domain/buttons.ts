import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import {
  channels,
  productSources,
  products,
  shops,
  type ButtonMode,
  type Channel,
  type ProductSource,
} from "@/server/db/schema";
import { sha1 } from "@/server/ids";
import { log } from "@/server/log";
import { enqueue } from "@/server/services/tasks";
import {
  classifyTelegramError,
  RetryLater,
  tg,
  webLink,
} from "@/server/services/telegram";
import { normalizeSettings } from "@/server/domain/shops";
import { getProductBundle, type ProductBundle } from "@/server/domain/products";
import { formatMoney } from "@/lib/money";
import { tc, type Locale } from "@/i18n/catalog";

/**
 * The post-button engine. Every listing in a connected channel or group keeps
 * a working Order button: on the post itself where Telegram allows editing it,
 * otherwise as a silent reply card under the post. State is desired-vs-applied
 * (a hash of the rendered buttons), so syncing is idempotent and self-healing.
 */

export type UrlButton = { text: string; url: string };
export type Keyboard = UrlButton[][];

function buttonLabels(lang: Locale) {
  return {
    order: tc(lang, "tg.buttons.order"),
    ask: tc(lang, "tg.buttons.ask_seller"),
    askPrice: tc(lang, "tg.buttons.ask_price"),
    shop: tc(lang, "tg.buttons.shop"),
    sold: tc(lang, "tg.buttons.sold"),
    askForPrice: tc(lang, "tg.buttons.ask_for_price"),
  };
}

export type ButtonProduct = {
  code: string;
  slug: string;
  title: string;
  status: ProductBundle["status"];
  priceMinor: bigint | null;
  currency: string;
  available: boolean;
};

export function toButtonProduct(p: ProductBundle): ButtonProduct {
  const v = p.variants[0];
  return {
    code: p.code,
    slug: p.slug,
    title: p.title,
    status: p.status,
    priceMinor: v?.priceMinor ?? null,
    currency: v?.currency ?? "ETB",
    available: Boolean(v) && (!v.trackInventory || v.inventoryQty > 0),
  };
}

/** Start parameters: [A-Za-z0-9_-] only; codes and handles satisfy that. */
export const startParam = {
  order: (productCode: string, sourceCode: string) => `p_${productCode}_${sourceCode}`,
  ask: (productCode: string, sourceCode: string) => `a_${productCode}_${sourceCode}`,
  shop: (handle: string) => `s_${handle}`,
};

export function renderKeyboard(input: {
  product: ButtonProduct;
  sourceCode: string;
  shopHandle: string;
  lang: "en" | "am";
}): Keyboard | null {
  const { product, sourceCode, shopHandle } = input;
  const l = buttonLabels(input.lang);
  if (product.status === "draft" || product.status === "archived") return null;

  const order = startParam.order(product.code, sourceCode);
  const ask = startParam.ask(product.code, sourceCode);
  const shop = startParam.shop(shopHandle);
  // Plain https → /go/… redirects into the storefront (shareable, stateful).
  const shopBtn = { text: l.shop, url: webLink(`/go/${shop}`) };

  if (product.status === "sold" || !product.available) {
    return [[{ text: l.sold, url: webLink(`/go/${shop}`) }]];
  }
  if (product.priceMinor === null) {
    return [[{ text: l.askPrice, url: webLink(`/go/${ask}`) }, shopBtn]];
  }
  const price = formatMoney(product.priceMinor, product.currency) ?? "";
  return [
    [{ text: `${l.order} · ${price}`, url: webLink(`/go/${order}`) }],
    [{ text: l.ask, url: webLink(`/go/${ask}`) }, shopBtn],
  ];
}

export function renderCardText(product: ButtonProduct, lang: "en" | "am"): string {
  const price =
    product.priceMinor !== null
      ? formatMoney(product.priceMinor, product.currency)
      : buttonLabels(lang).askForPrice;
  return `${product.title}\n${price}`;
}

/** Which way buttons can reach this post. */
export function chooseMode(
  source: Pick<ProductSource, "buttonMode" | "mediaGroupId" | "hadForeignMarkup">,
  channel: Pick<Channel, "chatType" | "canEditMessages">,
): ButtonMode {
  if (source.buttonMode === "bot_post") return "bot_post";
  if (source.buttonMode === "reply_card") return "reply_card";
  if (
    channel.chatType === "channel" &&
    channel.canEditMessages &&
    !source.mediaGroupId &&
    !source.hadForeignMarkup
  ) {
    return "inline";
  }
  return "reply_card";
}

export function desiredHash(mode: ButtonMode, keyboard: Keyboard | null, text: string | null) {
  // `links: "web"` bumps the hash when we switched from Mini App startapp URLs
  // to plain https, so existing posts re-sync on the next button job.
  return sha1(
    JSON.stringify({
      links: "web",
      mode,
      keyboard,
      text: mode === "reply_card" ? text : null,
    }),
  );
}

// ── scheduling ──────────────────────────────────────────────────────────────
/**
 * Mark sources as needing a sync and enqueue jobs. Every request gets its own
 * task: a sync always applies the latest state and is a no-op when nothing
 * changed, so extra tasks are cheap, while a dropped one would leave a stale
 * button. The first runs right away; more sources in the same chat are spaced
 * 3 s apart to stay well under Telegram's per-chat limits.
 */
export async function scheduleButtonSync(sourceIds: string[]): Promise<void> {
  if (!sourceIds.length) return;
  const rows = await db
    .update(productSources)
    .set({ syncRequestedAt: new Date(), buttonStatus: "pending" })
    .where(and(inArray(productSources.id, sourceIds), ne(productSources.buttonStatus, "deleted")))
    .returning({ id: productSources.id, chatId: productSources.chatId });

  const perChat = new Map<string, number>();
  for (const row of rows) {
    const k = row.chatId.toString();
    const n = perChat.get(k) ?? 0;
    perChat.set(k, n + 1);
    await enqueue("buttons", { sourceId: row.id }, { delaySeconds: n * 3 });
  }
}

export async function scheduleButtonSyncForProducts(shopId: string, productIds: string[]) {
  if (!productIds.length) return;
  const rows = await db
    .select({ id: productSources.id })
    .from(productSources)
    .where(and(eq(productSources.shopId, shopId), inArray(productSources.productId, productIds)));
  await scheduleButtonSync(rows.map((r) => r.id));
}

// ── sync ────────────────────────────────────────────────────────────────────
export type SyncOutcome =
  | "synced"
  | "unchanged"
  | "deleted"
  | "failed"
  | "skipped";

type Applied = { mode: ButtonMode; cardMessageId: number | null };

class FallbackToCard extends Error {}

async function applyInline(
  chatId: bigint,
  messageId: number,
  keyboard: Keyboard | null,
): Promise<void> {
  try {
    await tg().editMessageReplyMarkup(Number(chatId), messageId, {
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (err) {
    const c = classifyTelegramError(err);
    if (c.kind === "not_modified") return;
    throw err;
  }
}

async function applyCard(
  source: ProductSource,
  keyboard: Keyboard | null,
  text: string,
): Promise<number | null> {
  const chat = Number(source.chatId);
  if (!keyboard) {
    if (source.cardMessageId) {
      try {
        await tg().deleteMessage(chat, source.cardMessageId);
      } catch (err) {
        const c = classifyTelegramError(err);
        if (c.kind !== "message_not_found" && c.kind !== "cant_edit") throw err;
      }
    }
    return null;
  }
  if (source.cardMessageId) {
    try {
      await tg().editMessageText(chat, source.cardMessageId, text, {
        reply_markup: { inline_keyboard: keyboard },
        link_preview_options: { is_disabled: true },
      });
      return source.cardMessageId;
    } catch (err) {
      const c = classifyTelegramError(err);
      if (c.kind === "not_modified") return source.cardMessageId;
      if (c.kind !== "message_not_found") throw err;
      // Someone deleted the card: send a fresh one below.
    }
  }
  const sent = await tg().sendMessage(chat, text, {
    reply_parameters: { message_id: source.messageId, allow_sending_without_reply: true },
    disable_notification: true,
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard },
  });
  return sent.message_id;
}

/**
 * Bring one source's buttons in line with its product. Holds a row lock for
 * the duration so concurrent syncs can never send two reply cards.
 */
export async function syncButtons(sourceId: string): Promise<SyncOutcome> {
  const startedAt = new Date();
  const result = await db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(productSources)
      .where(eq(productSources.id, sourceId))
      .for("update");
    if (!source || source.buttonStatus === "deleted") return { outcome: "skipped" as const };

    const [channel] = await tx.select().from(channels).where(eq(channels.id, source.channelId));
    const [shop] = await tx.select().from(shops).where(eq(shops.id, source.shopId));
    const bundle = await getProductBundle(source.shopId, source.productId, tx);
    if (!channel || !shop || !bundle) return { outcome: "skipped" as const };
    if (channel.status !== "connected") {
      await markSource(tx, source.id, { buttonStatus: "failed", lastError: "Channel disconnected" });
      return { outcome: "failed" as const };
    }

    const settings = normalizeSettings(shop.settings);
    const product = toButtonProduct(bundle);
    const keyboard = settings.buttonsOnPosts
      ? renderKeyboard({
          product,
          sourceCode: source.code,
          shopHandle: shop.handle,
          lang: settings.buttonLanguage,
        })
      : null;
    const text = renderCardText(product, settings.buttonLanguage);
    let mode = chooseMode(source, channel);
    let hash = desiredHash(mode, keyboard, text);

    if (
      source.appliedHash === hash &&
      source.buttonMode === mode &&
      (source.buttonStatus === "synced" || source.buttonStatus === "pending")
    ) {
      // Telegram already shows exactly this; just record that we checked.
      await markSource(tx, source.id, { buttonStatus: "synced", lastSyncedAt: startedAt });
      return { outcome: "unchanged" as const };
    }

    let applied: Applied;
    try {
      applied = await apply(mode);
    } catch (err) {
      if (err instanceof FallbackToCard) {
        mode = "reply_card";
        hash = desiredHash(mode, keyboard, text);
        try {
          applied = await apply(mode);
        } catch (err2) {
          return handleFailure(tx, source, channel, err2);
        }
        await warnRights(tx, channel);
      } else {
        return handleFailure(tx, source, channel, err);
      }
    }

    await markSource(tx, source.id, {
      buttonMode: applied.mode,
      cardMessageId: applied.cardMessageId,
      desiredHash: hash,
      appliedHash: hash,
      buttonStatus: "synced",
      lastError: null,
      lastSyncedAt: startedAt,
    });
    return { outcome: "synced" as const };

    async function apply(m: ButtonMode): Promise<Applied> {
      if (m === "inline" || m === "bot_post") {
        // Leaving inline mode: remove a card left over from an earlier mode.
        try {
          await applyInline(source.chatId, source.messageId, keyboard);
        } catch (err) {
          const c = classifyTelegramError(err);
          if (m === "inline" && (c.kind === "cant_edit" || c.kind === "no_rights" || c.kind === "bad_request")) {
            throw new FallbackToCard(c.description);
          }
          throw err;
        }
        if (source.cardMessageId) await applyCard(source, null, text).catch(() => null);
        return { mode: m, cardMessageId: null };
      }
      const cardId = await applyCard(source, keyboard, text);
      return { mode: "reply_card", cardMessageId: cardId };
    }
  });

  if (result.outcome === "deleted") {
    await enqueue("notify", { kind: "source_deleted", sourceId }, { name: `source_deleted:${sourceId}` });
  }
  return result.outcome;
}

async function markSource(tx: Tx, id: string, set: Partial<typeof productSources.$inferInsert>) {
  await tx.update(productSources).set({ ...set, updatedAt: new Date() }).where(eq(productSources.id, id));
}

async function warnRights(tx: Tx, channel: Channel) {
  const dayAgo = Date.now() - 24 * 3600_000;
  if (channel.rightsWarnedAt && channel.rightsWarnedAt.getTime() > dayAgo) return;
  await tx
    .update(channels)
    .set({ rightsWarnedAt: new Date(), canEditMessages: false, updatedAt: new Date() })
    .where(eq(channels.id, channel.id));
  await enqueue(
    "notify",
    { kind: "rights_warning", channelId: channel.id },
    { name: `rights_warning:${channel.id}:${new Date().toISOString().slice(0, 10)}` },
  );
}

async function handleFailure(
  tx: Tx,
  source: ProductSource,
  channel: Channel,
  err: unknown,
): Promise<{ outcome: SyncOutcome }> {
  const c = classifyTelegramError(err);
  log.warn("button sync failed", { source_id: source.id, kind: c.kind, description: c.description });
  switch (c.kind) {
    case "rate_limited":
      throw new RetryLater(c.description, c.retryAfter ?? 10);
    case "transient":
      throw new RetryLater(c.description, 10);
    case "message_not_found": {
      await markSource(tx, source.id, { buttonStatus: "deleted", lastError: "Post deleted in Telegram" });
      // Hide the listing when no other live post carries it.
      const others = await tx
        .select({ id: productSources.id })
        .from(productSources)
        .where(
          and(
            eq(productSources.productId, source.productId),
            ne(productSources.id, source.id),
            ne(productSources.buttonStatus, "deleted"),
          ),
        );
      if (!others.length) {
        await tx
          .update(products)
          .set({ status: "archived", updatedAt: new Date() })
          .where(and(eq(products.id, source.productId), inArray(products.status, ["published", "draft"])));
      }
      return { outcome: "deleted" };
    }
    case "no_rights":
    case "cant_edit":
      await markSource(tx, source.id, { buttonStatus: "failed", lastError: c.description });
      await warnRights(tx, channel);
      return { outcome: "failed" };
    case "chat_not_found":
    case "blocked":
      await markSource(tx, source.id, { buttonStatus: "failed", lastError: c.description });
      await tx
        .update(channels)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(channels.id, channel.id));
      return { outcome: "failed" };
    default:
      await markSource(tx, source.id, { buttonStatus: "failed", lastError: c.description });
      return { outcome: "failed" };
  }
}

/** Health summary for the dashboard's Telegram page. */
export async function buttonHealth(shopId: string) {
  const rows = await db
    .select({
      channelId: productSources.channelId,
      mode: productSources.buttonMode,
      status: productSources.buttonStatus,
      lastSyncedAt: productSources.lastSyncedAt,
    })
    .from(productSources)
    .where(eq(productSources.shopId, shopId));
  const byChannel = new Map<
    string,
    { inline: number; cards: number; failing: number; pending: number; deleted: number; lastSyncedAt: Date | null }
  >();
  for (const r of rows) {
    const h =
      byChannel.get(r.channelId) ??
      { inline: 0, cards: 0, failing: 0, pending: 0, deleted: 0, lastSyncedAt: null };
    if (r.status === "deleted") h.deleted += 1;
    else if (r.status === "failed") h.failing += 1;
    else if (r.status === "pending") h.pending += 1;
    else if (r.mode === "inline" || r.mode === "bot_post") h.inline += 1;
    else if (r.mode === "reply_card") h.cards += 1;
    if (r.lastSyncedAt && (!h.lastSyncedAt || r.lastSyncedAt > h.lastSyncedAt)) h.lastSyncedAt = r.lastSyncedAt;
    byChannel.set(r.channelId, h);
  }
  return byChannel;
}

/** "Repair all": re-sync every failing or pending source of a channel. */
export async function repairChannelButtons(shopId: string, channelId: string) {
  const rows = await db
    .select({ id: productSources.id })
    .from(productSources)
    .where(
      and(
        eq(productSources.shopId, shopId),
        eq(productSources.channelId, channelId),
        inArray(productSources.buttonStatus, ["failed", "pending", "synced"]),
      ),
    );
  await scheduleButtonSync(rows.map((r) => r.id));
  return rows.length;
}
