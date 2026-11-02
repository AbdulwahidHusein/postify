import { requireShopPage } from "@/server/page";
import { serializeShop } from "@/server/domain/shops";
import { listMembers } from "@/server/domain/members";
import { shopCallsToday, shopQuota } from "@/server/domain/ai-guard";
import { can } from "@/server/auth/authorize";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { StaffPanel } from "@/components/dashboard/staff-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop, role, session } = await requireShopPage(handle, "shop.view", `/dashboard/${handle}/settings`);
  const [members, used] = await Promise.all([listMembers(shop.id), shopCallsToday(shop.id)]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        {can(role, "shop.settings") ? <SettingsForm shop={serializeShop(shop)} aiUsage={{ used, quota: shopQuota(shop) }} /> : (
          <p className="card p-4 text-sm text-mist">Ask the shop owner to change shop settings.</p>
        )}
        <StaffPanel handle={shop.handle} members={members} canManage={can(role, "shop.staff")} me={session.userId} />
      </div>
    </>
  );
}
