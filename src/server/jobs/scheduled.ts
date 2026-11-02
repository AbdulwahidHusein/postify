import "server-only";

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  aiCache,
  aiUsage,
  botContexts,
  loginTokens,
  notificationLog,
  productImages,
  productSources,
  products,
  shops,
  telegramUpdates,
} from "@/server/db/schema";
import { log } from "@/server/log";
import { enqueue } from "@/server/services/tasks";
import { tg } from "@/server/services/telegram";
import { processStaleOrders } from "@/server/domain/orders";
import { purgeExpiredCarts } from "@/server/domain/cart";
import { rollupDay } from "@/server/domain/analytics";
import { normalizeSettings } from "@/server/domain/shops";
import { scheduleButtonSyncForProducts } from "@/server/domain/buttons";
import { notifyOps } from "@/server/domain/notify";

const MAX_UPDATE_ATTEMPTS = 5;

/**
 * Safety net, every 5 minutes. Cloud Tasks already retries; this catches the
 * rare case where a write committed but its enqueue failed, or a job crashed.
 */
export async function sweep() {
  const now = Date.now();
  const bucket = Math.floor(now / 300_000);
  const out: Record<string, number> = {};

  // 1. Crashed ingest jobs → back to pending; exhausted ones → failed.
  await db
    .update(telegramUpdates)
    .set({ status: "failed", lastError: "gave up after retries" })
    .where(
      and(
        inArray(telegramUpdates.status, ["pending", "processing"]),
        sql`${telegramUpdates.attempts} >= ${MAX_UPDATE_ATTEMPTS}`,
      ),
    );
  await db
    .update(telegramUpdates)
    .set({ status: "pending" })
    .where(and(eq(telegramUpdates.status, "processing"), lt(telegramUpdates.receivedAt, new Date(now - 10 * 60_000))));
  const stuck = await db
    .selectDistinct({ groupKey: telegramUpdates.groupKey })
    .from(telegramUpdates)
    .where(and(eq(telegramUpdates.status, "pending"), lt(telegramUpdates.receivedAt, new Date(now - 2 * 60_000))))
    .limit(200);
  for (const s of stuck) await enqueue("ingest", { groupKey: s.groupKey }, { name: `${s.groupKey}:sweep:${bucket}` });
  out.ingest = stuck.length;

  // 2. Buttons whose requested sync never landed.
  const lagging = await db
    .select({ id: productSources.id })
    .from(productSources)
    .where(
      and(
        inArray(productSources.buttonStatus, ["pending", "synced"]),
        lt(productSources.syncRequestedAt, new Date(now - 2 * 60_000)),
        or(
          sql`${productSources.lastSyncedAt} is null`,
          sql`${productSources.syncRequestedAt} > ${productSources.lastSyncedAt}`,
        ),
      ),
    )
    .limit(300);
  for (const s of lagging) await enqueue("buttons", { sourceId: s.id }, { name: `${s.id}:sweep:${bucket}` });
  out.buttons = lagging.length;

  // 3. Images still pending.
  const images = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(
      and(
        eq(productImages.status, "pending"),
        lt(productImages.updatedAt, new Date(now - 5 * 60_000)),
        lt(productImages.attempts, 6),
      ),
    )
    .limit(200);
  for (const i of images) await enqueue("media", { imageId: i.id }, { name: `${i.id}:sweep:${bucket}` });
  out.media = images.length;

  // 4. Orders: reminders and auto-cancel.
  const stale = await processStaleOrders();
  out.reminded = stale.reminded;
  out.autoCancelled = stale.cancelled;

  // 5. Housekeeping.
  out.carts = await purgeExpiredCarts();
  await db.delete(botContexts).where(lt(botContexts.expiresAt, new Date()));

  // 6. Webhook health.
  try {
    const info = await tg().getWebhookInfo();
    const recentError = info.last_error_date && now / 1000 - info.last_error_date < 600;
    if (info.pending_update_count > 200 || recentError) {
      await notifyOps(
        `Telegram webhook unhealthy: ${info.pending_update_count} pending updates${
          recentError ? `, last error: ${info.last_error_message ?? "unknown"}` : ""
        }`,
        `webhook:${Math.floor(now / 3_600_000)}`,
      );
    }
  } catch (err) {
    log.warn("getWebhookInfo failed", { err });
  }

  log.info("sweep done", out);
  return out;
}

/** Nightly: analytics rollup, auto-archive, data retention. */
export async function nightly() {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await rollupDay(yesterday);

  // Auto-archive per shop setting.
  const allShops = await db.select().from(shops);
  let archived = 0;
  for (const shop of allShops) {
    const days = normalizeSettings(shop.settings).autoArchiveDays;
    if (!days) continue;
    const rows = await db
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(products.shopId, shop.id),
          eq(products.status, "published"),
          lt(products.publishedAt, new Date(Date.now() - days * 86_400_000)),
        ),
      )
      .returning({ id: products.id });
    archived += rows.length;
    await scheduleButtonSyncForProducts(shop.id, rows.map((r) => r.id));
  }

  const days = (n: number) => new Date(Date.now() - n * 86_400_000);
  await db
    .delete(telegramUpdates)
    .where(and(inArray(telegramUpdates.status, ["done", "skipped", "failed"]), lt(telegramUpdates.receivedAt, days(30))));
  await db.delete(aiUsage).where(lt(aiUsage.createdAt, days(90)));
  await db.delete(aiCache).where(lt(aiCache.createdAt, days(30)));
  await db.delete(notificationLog).where(lt(notificationLog.createdAt, days(30)));
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, days(1)));

  log.info("nightly done", { rolled: yesterday, archived });
  return { rolled: yesterday, archived };
}
