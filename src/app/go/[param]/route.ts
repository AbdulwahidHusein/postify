import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { productSources, shops } from "@/server/db/schema";
import { appUrl } from "@/server/env";
import { getSession } from "@/server/auth/session";
import { getProductByCode } from "@/server/domain/products";
import { startConversation } from "@/server/domain/chat";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * Landing for Telegram buttons (plain https /go/… links; also Mini App startapp):
 *   p_<product>_<source>  → product page, straight into checkout
 *   a_<product>_<source>  → conversation with the seller about the product
 *   s_<shop handle>       → storefront
 */
export async function GET(_req: Request, ctx: { params: Promise<{ param: string }> }) {
  const param = (await ctx.params).param;
  const to = (path: string) => NextResponse.redirect(`${appUrl()}${path}`);
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(param)) return to("/");

  const [kind, a, b] = param.split("_");
  try {
    if (kind === "s" && a) {
      const handle = param.slice(2);
      const shop = await db.query.shops.findFirst({ where: eq(shops.handle, handle), columns: { handle: true } });
      return to(shop ? `/s/${shop.handle}` : "/");
    }
    if ((kind === "p" || kind === "a") && a) {
      const product = await getProductByCode(a);
      if (!product) return to("/");
      const src =
        b && /^[A-Za-z0-9]{4,16}$/.test(b)
          ? (await db.query.productSources.findFirst({ where: eq(productSources.code, b), columns: { code: true } }))?.code ?? null
          : null;
      const productPath = `/s/${product.shop.handle}/p/${product.slug}${src ? `?src=${src}` : ""}`;
      if (kind === "p") {
        const order = product.status === "published" ? `${src ? "&" : "?"}order=1` : "";
        return to(`${productPath}${order}`);
      }
      const session = await getSession();
      if (!session) return to(`/login?next=${encodeURIComponent(`/go/${param}`)}`);
      try {
        const conv = await startConversation({ shopId: product.shopId, productId: product.id, buyerUserId: session.userId, sourceCode: src });
        return to(`/inbox/${conv.id}`);
      } catch {
        // e.g. the seller tapping their own button: show the product instead.
        return to(productPath);
      }
    }
  } catch (err) {
    log.warn("go link failed", { param, err });
  }
  return to("/");
}
