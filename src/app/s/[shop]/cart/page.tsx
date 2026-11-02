import { getStorefront } from "@/server/page";
import { t } from "@/i18n";
import { CartView } from "@/components/store/cart-view";

export const metadata = { title: "Cart" };

export default async function CartPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-5 font-display text-[26px] font-bold tracking-[-0.01em]">{t(locale, "cart.title")}</h1>
      <CartView shop={shop.handle} base={base} locale={locale} />
    </div>
  );
}
