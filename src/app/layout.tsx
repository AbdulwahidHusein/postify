import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers/app-providers";
import { appName } from "@/lib/env";
import "./globals.css";

// Self-hosted variable fonts (OFL), subset and trimmed to weights 400–700.
// Instrument Sans: dense UI text. Menbere: display + all Amharic; its Latin
// and Ethiopic were drawn together, so shop names and prices match in both
// scripts. The Ethiopic file only downloads on pages that contain Amharic.
const uiSans = localFont({ src: "./fonts/instrument-sans-latin.woff2", variable: "--font-ui", weight: "400 700", display: "swap" });
const display = localFont({ src: "./fonts/menbere-latin.woff2", variable: "--font-menbere", weight: "400 700", display: "swap" });
const ethiopic = localFont({
  src: "./fonts/menbere-ethiopic.woff2",
  variable: "--font-ethiopic",
  weight: "400 700",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+1200-137F, U+2010-2014, U+2018-201D, U+2026" }],
});

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "Online shops for Telegram sellers in Ethiopia. Post in your channel; we handle the store, orders and buyers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f5f1",
};

/** Inside Telegram: signal readiness early, expand, keep our light theme. */
const telegramBoot = `
(function(){try{var tg=window.Telegram&&window.Telegram.WebApp;if(!tg||!tg.initData)return;
document.documentElement.dataset.platform="tma";tg.ready();tg.expand();
try{tg.disableVerticalSwipes&&tg.disableVerticalSwipes()}catch(e){}
try{tg.setHeaderColor&&tg.setHeaderColor("#ffffff");tg.setBackgroundColor&&tg.setBackgroundColor("#f4f5f1")}catch(e){}
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
