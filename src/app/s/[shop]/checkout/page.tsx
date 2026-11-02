import { getStorefront } from "@/server/page";
import { normalizeSettings } from "@/server/domain/shops";
import { getViewer } from "@/server/request";
import { t } from "@/i18n";
import { CheckoutForm } from "@/components/store/checkout-form";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop, base, locale } = await getStorefront((await params).shop);
  const s = normalizeSettings(shop.settings);
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-5 font-display text-[26px] font-bold tracking-[-0.01em]">{t(locale, "checkout.title")}</h1>
      <CheckoutForm
        shop={shop.handle}
        base={base}
        locale={locale}
        delivery={{ enabled: s.delivery.deliveryEnabled, feeMinor: s.delivery.deliveryFeeMinor, note: s.delivery.deliveryNote }}
        pickup={{ enabled: s.delivery.pickupEnabled, address: s.delivery.pickupAddress }}
        prefill={{ name: viewer ? [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") : "", phone: viewer?.phone ?? "" }}
      />
    </div>
  );
}
