import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { json, readJson } from "@/server/http";
import { storefrontRoute } from "@/server/storefront-route";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import { trackEvent } from "@/server/domain/analytics";

const body = z.object({
  type: z.enum(["product_viewed", "shop_viewed", "online_payment_interest"]),
  productId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().regex(/^[A-Za-z0-9]{4,16}$/).nullable().optional(),
});

/** Client beacons (views are counted client-side because pages are CDN-cached). */
export const POST = storefrontRoute(async (request, shop) => {
  const e = await readJson(request, body.parse);
  if (e.productId) {
    const p = await db.query.products.findFirst({
      where: and(eq(products.id, e.productId), eq(products.shopId, shop.id)),
      columns: { id: true },
    });
    if (!p) return json({ ok: true });
  }
  const session = await getSession();
  await trackEvent({ shopId: shop.id, type: e.type, productId: e.productId ?? null, sourceCode: e.sourceCode ?? null, actorUserId: session?.userId ?? null });
  return json({ ok: true });
});
