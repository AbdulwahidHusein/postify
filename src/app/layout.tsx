import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers/app-providers";
import { appName } from "@/lib/env";
import "./globals.css";

// Self-hosted variable fonts (OFL): no build-time network, served from our CDN.
const dmSans = localFont({ src: "./fonts/dm-sans-latin.woff2", variable: "--font-dm-sans", weight: "100 1000", display: "swap" });
const ethiopic = localFont({ src: "./fonts/noto-sans-ethiopic.woff2", variable: "--font-ethiopic", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "Online shops for Telegram sellers in Ethiopia. Post in your channel; we handle the store, orders and buyers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7fa",
};

/** Inside Telegram: signal readiness early, expand, keep our light theme. */
const telegramBoot = `
(function(){try{var tg=window.Telegram&&window.Telegram.WebApp;if(!tg||!tg.initData)return;
document.documentElement.dataset.platform="tma";tg.ready();tg.expand();
try{tg.disableVerticalSwipes&&tg.disableVerticalSwipes()}catch(e){}
try{tg.setHeaderColor&&tg.setHeaderColor("#f5f7fa");tg.setBackgroundColor&&tg.setBackgroundColor("#f5f7fa")}catch(e){}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${ethiopic.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="telegram-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: telegramBoot }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
