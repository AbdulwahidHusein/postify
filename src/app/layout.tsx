import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Sans, Syne } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { SiteHeader } from "@/components/layout/site-header";
import { appName } from "@/lib/env";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description:
    "Turn Telegram channel posts into ecommerce storefronts — Mini App and web.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#f4f6f9" },
  ],
};

/** Keep Mini App light — do not adopt Telegram dark theme colors. */
const telegramBootScript = `
(function () {
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;
    document.documentElement.dataset.platform = "tma";
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") {
      try { tg.disableVerticalSwipes(); } catch (e) {}
    }
    if (tg.setHeaderColor) {
      try { tg.setHeaderColor("#f4f6f9"); } catch (e) {}
    }
    if (tg.setBackgroundColor) {
      try { tg.setBackgroundColor("#f4f6f9"); } catch (e) {}
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Telegram web-app.js + boot script mutate html/body before hydrate
    // (data-platform, --tg-viewport-*). Ignore that intentional mismatch.
    <html
      lang="en"
      className={`${dmSans.variable} ${syne.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col antialiased"
        suppressHydrationWarning
      >
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <Script
          id="telegram-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: telegramBootScript }}
        />
        <div id="app-root" className="flex min-h-full flex-1 flex-col">
          <AppProviders>
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
