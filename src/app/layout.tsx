import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers/app-providers";
import { appName } from "@/lib/env";
import "./globals.css";

// Self-hosted variable fonts (OFL). Rubik: display, prices, buttons.
// Nunito Sans: body and UI text. Noto Sans Ethiopic: all Amharic, in both
// stacks; it only downloads on pages that contain Ethiopic characters.
const uiSans = localFont({ src: "./fonts/nunito-sans-latin.woff2", variable: "--font-ui", weight: "200 1000", display: "swap" });
const display = localFont({ src: "./fonts/rubik-latin.woff2", variable: "--font-rubik", weight: "300 900", display: "swap" });
const ethiopic = localFont({
  src: "./fonts/noto-sans-ethiopic.woff2",
  variable: "--font-ethiopic",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+1200-139F, U+2D80-2DDF, U+AB00-AB2F" }],
});

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "Online shops for Telegram sellers in Ethiopia. Post in your channel; we handle the store, orders and buyers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f4f1",
};

/** Inside Telegram: signal readiness early, expand, keep our light theme. */
const telegramBoot = `
(function(){try{var tg=window.Telegram&&window.Telegram.WebApp;if(!tg||!tg.initData)return;
document.documentElement.dataset.platform="tma";tg.ready();tg.expand();
try{tg.disableVerticalSwipes&&tg.disableVerticalSwipes()}catch(e){}
try{tg.setHeaderColor&&tg.setHeaderColor("#ffffff");tg.setBackgroundColor&&tg.setBackgroundColor("#f8f4f1")}catch(e){}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${uiSans.variable} ${display.variable} ${ethiopic.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="telegram-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: telegramBoot }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
