import Link from "next/link";
import { MessageCircle, Send, ShoppingBag, Store, Zap } from "lucide-react";
import { botStartLink } from "@/server/services/telegram";
import { buttonVariants } from "@/components/ui/button";
import { MiniAppEntry } from "@/components/auth/mini-app-entry";

export default function Landing() {
  const connect = botStartLink("connect");
  const features = [
    { icon: Zap, title: "Post as usual", body: "Every photo with a price in your channel or group becomes a product, read automatically in Amharic or English." },
    { icon: ShoppingBag, title: "An Order button on your posts", body: "Buyers tap Order right under your post and check out in seconds, inside Telegram." },
    { icon: MessageCircle, title: "Orders and questions in one place", body: "New orders and buyer messages arrive in the Goods bot. Reply right from Telegram." },
    { icon: Store, title: "Your own online shop", body: "A clean storefront at yourshop.goods.et with search, categories and collections." },
  ];
  return (
    <main>
      <MiniAppEntry />
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-16 sm:pt-24">
        <p className="text-sm font-semibold text-signal">Goods · for Telegram sellers in Ethiopia</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your Telegram channel, now a real shop.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-mist">
          Keep posting in your channel. Goods turns each post into a product with an Order button, takes orders with pay on delivery, and gives you a simple dashboard. Free.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={connect} className={buttonVariants({ size: "lg" })}><Send size={18} /> Start in Telegram</a>
          <Link href="/login" className={buttonVariants({ size: "lg", variant: "secondary" })}>Sign in</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="card p-5">
            <f.icon className="text-signal" size={22} />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-mist">{f.body}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-5xl px-5 pb-24">
        <div className="card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Set up in two taps</h2>
          <ol className="mt-4 space-y-2 text-sm text-ink-soft">
            <li>1. Open the Goods bot and tap <b>Connect channel</b>.</li>
            <li>2. Pick your channel. Your shop is created and your next post goes live with an Order button.</li>
          </ol>
          <a href={connect} className={buttonVariants({ className: "mt-6" })}>Open the bot</a>
        </div>
      </section>
    </main>
  );
}
