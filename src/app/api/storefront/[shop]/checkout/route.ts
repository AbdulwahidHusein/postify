import { json, readJson, AppError } from "@/server/http";
import { storefrontRoute } from "@/server/storefront-route";
import { cartOwnerKey } from "@/server/request";
import { getSession } from "@/server/auth/session";
import { checkoutSchema, placeOrder } from "@/server/domain/orders";

export const POST = storefrontRoute(async (request, shop) => {
  const input = await readJson(request, checkoutSchema.parse);
  const key = await cartOwnerKey(false);
  if (!key) throw new AppError("Your cart is empty", 400, "empty_cart");
  const session = await getSession();
  const order = await placeOrder({ shop, ownerKey: key, buyerUserId: session?.userId ?? null, checkout: input });
  return json(
    { order: { id: order.id, number: order.number, accessToken: order.accessToken, totalMinor: order.totalMinor.toString() } },
    { status: 201 },
  );
});
