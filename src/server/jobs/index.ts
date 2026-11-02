import "server-only";

import { z } from "zod";
import type { QueueName } from "@/server/services/tasks";
import { processIngest } from "@/server/domain/ingest";
import { processImage } from "@/server/domain/media";
import { syncButtons } from "@/server/domain/buttons";
import {
  notifyChatMessage,
  notifyListingReceipt,
  notifyOps,
  notifyOrderPlaced,
  notifyOrderReminder,
  notifyOrderStatus,
  notifyRightsWarning,
  notifySourceDeleted,
} from "@/server/domain/notify";

const ingestPayload = z.object({ groupKey: z.string().min(3) });
const mediaPayload = z.object({ imageId: z.string().uuid() });
const buttonsPayload = z.object({ sourceId: z.string().uuid() });
const notifyPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listing_receipt"), productId: z.string().uuid(), reason: z.string() }),
  z.object({ kind: z.literal("rights_warning"), channelId: z.string().uuid() }),
  z.object({ kind: z.literal("source_deleted"), sourceId: z.string().uuid() }),
  z.object({ kind: z.literal("order_placed"), orderId: z.string().uuid() }),
  z.object({ kind: z.literal("order_status"), orderId: z.string().uuid(), status: z.string() }),
  z.object({ kind: z.literal("order_reminder"), orderId: z.string().uuid() }),
  z.object({ kind: z.literal("seller_message"), messageId: z.string().uuid() }),
  z.object({ kind: z.literal("buyer_message"), messageId: z.string().uuid() }),
  z.object({ kind: z.literal("ops_alert"), text: z.string(), key: z.string().optional() }),
]);

/**
 * Run one background job. Throwing makes the task runner return a retryable
 * status; returning means done (including "nothing to do").
 */
export async function runJob(queue: QueueName, payload: unknown): Promise<unknown> {
  switch (queue) {
    case "ingest":
      return processIngest(ingestPayload.parse(payload).groupKey);
    case "media":
      return processImage(mediaPayload.parse(payload).imageId);
    case "buttons":
      return syncButtons(buttonsPayload.parse(payload).sourceId);
    case "notify": {
      const p = notifyPayload.parse(payload);
      switch (p.kind) {
        case "listing_receipt":
          return notifyListingReceipt(p.productId, p.reason);
        case "rights_warning":
          return notifyRightsWarning(p.channelId);
        case "source_deleted":
          return notifySourceDeleted(p.sourceId);
        case "order_placed":
          return notifyOrderPlaced(p.orderId);
        case "order_status":
          return notifyOrderStatus(p.orderId, p.status);
        case "order_reminder":
          return notifyOrderReminder(p.orderId);
        case "seller_message":
          return notifyChatMessage(p.messageId, "seller");
        case "buyer_message":
          return notifyChatMessage(p.messageId, "buyer");
        case "ops_alert":
          return notifyOps(p.text, p.key ?? p.text.slice(0, 40));
      }
      return undefined;
    }
    default:
      throw new Error(`Unknown queue: ${String(queue)}`);
  }
}
