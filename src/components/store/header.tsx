import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { t, type Locale } from "@/i18n";
import { LangToggle } from "@/components/store/lang-toggle";
import { CartCount } from "@/components/store/cart-count";

export function StoreHeader({ shop, base, locale, logoUrl, apiShop }: { shop: { name: string }; base: string; locale: Locale; logoUrl: string | null; apiShop: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href={base || "/"} className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--shop-accent)] text-sm font-bold text-white">{shop.name.slice(0, 1)}</span>
          )}
          <span className="truncate font-semibold">{shop.name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LangToggle locale={locale} />
          <Link href={`${base}/cart`} className="relative rounded-lg p-2 hover:bg-paper-muted" aria-label={t(locale, "nav.cart")}>
            <ShoppingCart size={20} />
            <CartCount shop={apiShop} />
          </Link>
        </div>
      </div>
    </header>
  );
}
