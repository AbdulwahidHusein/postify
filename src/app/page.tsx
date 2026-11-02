import Link from "next/link";
import { ArrowDown, Check, MessageCircle, Send, ShoppingBag, Store } from "lucide-react";
import { botStartLink } from "@/server/services/telegram";
import { buttonVariants } from "@/components/ui/button";
import { MiniAppEntry } from "@/components/auth/mini-app-entry";
import { GoodsLogo } from "@/components/brand";
import { cn } from "@/lib/utils";

export const metadata = { title: { absolute: "Goods: your Telegram channel, now a real shop" } };

/** A jebena on a woven mat: the product in the hero's example post. */
function JebenaPhoto() {
  return (
    <svg viewBox="0 0 320 220" className="block h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d9a4" />
          <stop offset="1" stopColor="#d9a35f" />
        </linearGradient>
        <linearGradient id="clay" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b2a22" />
          <stop offset="1" stopColor="#16100d" />
        </linearGradient>
      </defs>
      <rect width="320" height="220" fill="url(#bg)" />
      <ellipse cx="160" cy="196" rx="120" ry="16" fill="#0e6b4e" />
      <ellipse cx="160" cy="194" rx="104" ry="11" fill="#f2b705" />
      <ellipse cx="160" cy="192" rx="88" ry="7" fill="#0e6b4e" />
      {/* jebena */}
      <path d="M160 92c-34 0-54 26-54 56 0 22 14 40 54 40s54-18 54-40c0-30-20-56-54-56z" fill="url(#clay)" />
      <path d="M150 94c2-22 2-40 0-52h20c-2 12-2 30 0 52z" fill="url(#clay)" />
      <path d="M147 40h26c2 0 3-3 0-5-4-3-22-3-26 0-3 2-2 5 0 5z" fill="#2b1e18" />
      <path d="M108 140c-18-6-30-22-36-40l-4 2c4 22 18 40 38 46z" fill="url(#clay)" />
      <path d="M212 112c18 0 26 14 22 28-3 10-12 16-22 18" fill="none" stroke="#2b1e18" strokeWidth="7" strokeLinecap="round" />
      <path d="M128 150c10 10 54 10 64 0" fill="none" stroke="#f2b705" strokeWidth="3" strokeLinecap="round" opacity=".9" />
      {/* cups */}
      <path d="M236 166h26l-3 18h-20z" fill="#fff" />
      <path d="M58 166h26l-3 18H61z" fill="#fff" />
      <path d="M240 172h18M62 172h18" stroke="#0e6b4e" strokeWidth="2" />
    </svg>
  );
}

function TelegramPost() {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      {/* Telegram's chat wallpaper green, simplified */}
      <div className="rounded-[28px] bg-[#c9dcb7] p-3 shadow-pop sm:p-4" style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / 0.18) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
        <div className="mb-3 flex items-center gap-2.5 rounded-2xl bg-white/80 px-3 py-2 backdrop-blur">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#6b3e26] font-display text-sm font-bold text-white">ቡ</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold leading-tight">Buna Home Goods</span>
            <span className="block text-[11px] text-mist">12,480 subscribers</span>
          </span>
        </div>

        <div className="overflow-hidden rounded-[18px] rounded-bl-[6px] bg-white shadow-sm">
          <JebenaPhoto />
          <div className="px-3 pb-2 pt-2.5 text-[14px] leading-snug" lang="am">
            <p className="font-semibold">የጀበና ስብስብ ከ6 ስኒዎች ጋር ☕</p>
            <p className="text-ink-soft">በእጅ የተሰራ፣ ከቡና ማፍያ ጋር። አዲስ አበባ ውስጥ በዛሬው ቀን እናደርሳለን።</p>
            <p className="mt-1 font-semibold">ዋጋ፦ 1,500 ብር</p>
            <p className="mt-1 text-right text-[11px] text-faint">2.1K 👁 10:24</p>
          </div>
        </div>
        {/* Inline keyboard added by Goods */}
        <div className="mt-1 grid grid-cols-2 gap-1">
          <span className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#5f7f4f]/55 text-[13px] font-semibold text-white backdrop-blur">
            <ShoppingBag size={14} /> Order · ETB 1,500
          </span>
          <span className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#5f7f4f]/55 text-[13px] font-semibold text-white backdrop-blur">
            <MessageCircle size={14} /> Ask seller
          </span>
          <span className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#5f7f4f]/55 text-[13px] font-semibold text-white backdrop-blur">
            <Store size={14} /> Shop
          </span>
        </div>
      </div>

      {/* The seller's side: the order lands in the Goods bot */}
      <div className="relative z-10 -mt-3 ml-auto mr-[-8px] w-[80%] rounded-2xl bg-surface p-3 shadow-pop sm:mr-[-40px]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M12 4.5 19.5 12 12 19.5 4.5 12z" fill="#f2b705" /></svg></span>
          <span className="text-[12px] font-bold">Goods bot</span>
          <span className="ml-auto text-[11px] text-faint">10:31</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug"><b>New order #1042</b>, Hana T., Bole. Jebena set, ETB 1,650 with delivery.</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <span className="flex h-8 items-center justify-center gap-1 rounded-lg bg-brand text-[12px] font-bold text-white"><Check size={13} strokeWidth={3} /> Confirm</span>
          <span className="flex h-8 items-center justify-center rounded-lg bg-sunken text-[12px] font-semibold">Call buyer</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const connect = botStartLink("connect");
  const steps = [
    { title: "Connect your channel", body: "Open the Goods bot, tap Connect, pick your channel. Your shop exists from that moment." },
    { title: "Post like you always do", body: "A photo and a price in Amharic or English. Goods reads it and adds Order, Ask and Shop buttons to the post." },
    { title: "Confirm and deliver", body: "Orders arrive in the bot. Confirm with one tap, deliver, collect cash on delivery." },
  ];
  return (
    <div className="min-h-dvh bg-canvas">
      <MiniAppEntry />
      <div aria-hidden className="tibeb h-3.5" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <GoodsLogo />
        <Link href="/login" className="text-sm font-semibold text-ink-soft hover:text-ink">Sign in</Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-14">
          <div>
            <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">
              Your Telegram channel, now a real shop.
            </h1>
            <p className="mt-3 font-display text-xl font-semibold text-brand sm:text-2xl" lang="am">ቴሌግራም ላይ ይለጥፉ፣ እንደ ሱቅ ይሽጡ።</p>
            <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-soft">
              Keep posting where your buyers already are. Goods puts an Order button on every post, takes orders with pay on delivery, and gives you an online shop and a dashboard. Free for sellers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={connect} className={buttonVariants({ variant: "telegram", size: "lg" })}><Send size={18} /> Start in Telegram</a>
              <Link href="/login" className={buttonVariants({ variant: "secondary", size: "lg" })}>Sign in</Link>
            </div>
            <p className="mt-4 text-sm text-mist">Takes about a minute. No website, no forms.</p>
          </div>
          <div className="pr-2 sm:pr-10">
            <TelegramPost />
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-[28px] font-bold tracking-[-0.01em]">Three steps, all inside Telegram</h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="num grid h-9 w-9 place-items-center rounded-full bg-ink font-display font-bold text-white">{i + 1}</span>
                  {i < steps.length - 1 ? <ArrowDown size={16} className="absolute left-2.5 top-12 text-faint md:hidden" /> : null}
                  <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-1.5 max-w-xs text-[15px] text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-[28px] font-bold tracking-[-0.01em]">A back office that fits in your pocket</h2>
            <p className="mt-3 max-w-md text-[15px] text-ink-soft">Everything Shopify gives a big store, cut down to what a Telegram seller uses every day. It works in the Telegram app and on a laptop.</p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {[
              ["Orders", "Confirm, send out, mark paid. Copy a delivery slip for your rider."],
              ["Products", "Edit prices and stock. Changes update the buttons on your posts."],
              ["Customers", "Every buyer with their phone, address and history."],
              ["Inbox", "Buyer questions from every post, answered from the bot or the web."],
              ["Your shop", "yourname.goods.et, in Amharic and English, with search and categories."],
            ].map(([k, v]) => (
              <li key={k} className="grid grid-cols-[110px_1fr] gap-4 py-3.5 text-[15px]">
                <span className="font-semibold">{k}</span>
                <span className="text-ink-soft">{v}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className={cn("overflow-hidden rounded-[24px] bg-brand text-white")}>
            <div className="flex flex-col items-start gap-5 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
              <div>
                <h2 className="font-display text-[26px] font-bold leading-tight">Open your shop today</h2>
                <p className="mt-1 text-white/80">Free while we grow. Online payments are coming.</p>
              </div>
              <a href={connect} className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-adey px-5 text-[15px] font-bold text-ink hover:bg-[#ffc81f]">
                <Send size={18} /> Start in Telegram
              </a>
            </div>
            <div aria-hidden className="tibeb h-3.5" />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-mist">
          <GoodsLogo size={18} className="[&>span:last-child]:text-sm" />
          <span>Made in Addis Ababa</span>
        </div>
      </footer>
    </div>
  );
}
