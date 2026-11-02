import { z } from "zod";
import { json, readJson } from "@/server/http";
import { storefrontRoute } from "@/server/storefront-route";
import { cartOwnerKey } from "@/server/request";
import { addToCart, readCart, setLineQuantity } from "@/server/domain/cart";
import { trackEvent } from "@/server/domain/analytics";

export const dynamic = "force-dynamic";

const empty = { cartId: null, lines: [], subtotalMinor: "0", currency: "ETB", count: 0 };

export const GET = storefrontRoute(async (_req, shop) => {
  const key = await cartOwnerKey(false);
  return json(key ? await readCart(shop.id, key) : empty);
});

const add = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  sourceCode: z.string().regex(/^[A-Za-z0-9]{4,16}$/).nullable().optional(),
});

export const POST = storefrontRoute(async (request, shop) => {
  const input = await readJson(request, add.parse);
  const key = (await cartOwnerKey(true))!;
  const cart = await addToCart({ shopId: shop.id, ownerKey: key, ...input });
  const line = cart.lines.find((l) => l.variantId === input.variantId);
  await trackEvent({ shopId: shop.id, type: "added_to_cart", productId: line?.productId, sourceCode: input.sourceCode ?? null });
  return json(cart);
});

const set = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(0).max(99) });

export const PATCH = storefrontRoute(async (request, shop) => {
  const input = await readJson(request, set.parse);
  const key = await cartOwnerKey(false);
  if (!key) return json(empty);
  return json(await setLineQuantity({ shopId: shop.id, ownerKey: key, ...input }));
});
