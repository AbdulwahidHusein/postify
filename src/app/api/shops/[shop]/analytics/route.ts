import { json } from "@/server/http";
import { searchParams, shopRoute } from "@/server/shop-route";
import { shopAnalytics } from "@/server/domain/analytics";

export const dynamic = "force-dynamic";

export const GET = shopRoute("analytics.view", async (request, { shop }) => {
  const d = Number(searchParams(request).get("days"));
  const days = d === 90 ? 90 : d === 30 ? 30 : 7;
  return json(await shopAnalytics(shop.id, days));
});
