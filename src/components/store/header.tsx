import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { t, type Locale } from "@/i18n";
import { LangToggle } from "@/components/store/lang-toggle";
import { CartCount } from "@/components/store/cart-count";

export function StoreHeader({ shop, base, locale, logoUrl, apiShop }: { shop: { name: string }; base: string; locale: Locale; logoUrl: string | null; apiShop: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href={base || "/"} className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-[10px] object-cover ring-1 ring-line" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent font-display text-sm font-bold text-accent-fg">{shop.name.slice(0, 1)}</span>
          )}
          <span className="truncate font-display text-[15px] font-semibold">{shop.name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LangToggle locale={locale} />
          <Link href={`${base}/cart`} className="relative grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-sunken" aria-label={t(locale, "nav.cart")}>
            <ShoppingBag size={20} />
            <CartCount shop={apiShop} />
          </Link>
        </div>
      </div>
    </header>
  );
}
