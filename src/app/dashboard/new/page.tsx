import { redirect } from "next/navigation";
import { getViewer } from "@/server/request";
import { CreateShopForm } from "@/components/dashboard/create-shop-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create shop" };

export default async function NewShopPage() {
  const user = await getViewer();
  if (!user) redirect("/login?next=/dashboard/new");
  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="page-title">Create a shop</h1>
      <p className="mt-1 text-sm text-mist">You can connect a Telegram channel later from the Telegram page.</p>
      <CreateShopForm />
    </main>
  );
}
