import { getStorefront } from "@/server/page";
import { t } from "@/i18n";
import { CartView } from "@/components/store/cart-view";

export const metadata = { title: "Cart" };

export default async function CartPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5 text-2xl font-semibold">{t(locale, "cart.title")}</h1>
      <CartView shop={shop.handle} base={base} locale={locale} />
    </div>
  );
}
