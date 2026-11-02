import { requireShopPage } from "@/server/page";
import { allowedActions } from "@/server/auth/authorize";
import { listShopsForUser, shopLogoUrl, storefrontHost, storefrontUrl } from "@/server/domain/shops";
import { shellBadges } from "@/server/dashboard";
import { DashboardShell } from "@/components/dashboard/shell";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop, role, session } = await requireShopPage(handle, "shop.view", `/dashboard/${handle}`);
  const [mine, badges] = await Promise.all([listShopsForUser(session.userId), shellBadges(shop.id)]);
  return (
    <DashboardShell
      shop={{ handle: shop.handle, name: shop.name, logoUrl: shopLogoUrl(shop) }}
      shops={mine.map((m) => ({ handle: m.shop.handle, name: m.shop.name, logoUrl: shopLogoUrl(m.shop) }))}
      actions={allowedActions(role)}
      badges={badges}
      storeUrl={storefrontUrl(shop.handle)}
      storeHost={storefrontHost(shop.handle)}
    >
      {children}
    </DashboardShell>
  );
}
