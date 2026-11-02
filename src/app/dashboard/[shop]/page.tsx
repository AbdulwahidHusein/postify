import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ArrowRight, Check, ChevronRight, CircleAlert, MessageCircle, PackagePlus, PencilLine, Send, Share2, ShoppingBag, Truck,
} from "lucide-react";
import { requireShopPage } from "@/server/page";
import { homeSummary } from "@/server/dashboard";
import { listOrders, serializeOrder } from "@/server/domain/orders";
import { shopAnalytics } from "@/server/domain/analytics";
import { listChannels } from "@/server/domain/channels";
import { storefrontHost, storefrontUrl } from "@/server/domain/shops";
import { botStartLink, postLink } from "@/server/services/telegram";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { OrderStatus } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/trend-chart";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Addis_Ababa" }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: handle } = await params;
  const { shop, session } = await requireShopPage(handle, "shop.view", `/dashboard/${handle}`);
  const [s, recent, week, chans, me] = await Promise.all([
    homeSummary(shop.id),
    listOrders(shop.id, { limit: 6 }),
    shopAnalytics(shop.id, 7),
    listChannels(shop.id),
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
  ]);
  const base = `/dashboard/${shop.handle}`;
  const money = (minor: bigint | string | number) => formatMoney(BigInt(minor), shop.currency) ?? `${shop.currency} 0`;
  const storeUrl = storefrontUrl(shop.handle);
  const connected = chans.filter((c) => c.status === "connected");

  const todo = [
    { n: s.todo.toConfirm, label: s.todo.toConfirm === 1 ? "order waiting for you to confirm" : "orders waiting for you to confirm", href: `${base}/orders?tab=to_confirm`, icon: ShoppingBag, urgent: true },
    { n: s.todo.unread, label: s.todo.unread === 1 ? "unread message from a buyer" : "unread messages from buyers", href: `${base}/inbox?filter=unread`, icon: MessageCircle, urgent: true },
    { n: s.todo.failingButtons, label: "Telegram posts lost their Order button", href: `${base}/telegram`, icon: CircleAlert, urgent: true },
    { n: s.todo.toShip, label: s.todo.toShip === 1 ? "order to deliver" : "orders to deliver", href: `${base}/orders?tab=to_ship`, icon: Truck },
    { n: s.todo.needsPrice, label: s.todo.needsPrice === 1 ? "post needs a price before it goes live" : "posts need a price before they go live", href: `${base}/products?status=attention`, icon: PencilLine },
    { n: s.todo.drafts, label: s.todo.drafts === 1 ? "draft to review" : "drafts to review", href: `${base}/products?status=draft`, icon: PencilLine },
  ].filter((t) => t.n > 0);
  const urgent = todo.filter((t) => t.urgent).reduce((n, t) => n + t.n, 0);

  const setup = [
    { done: connected.length > 0, title: "Connect your Telegram channel", body: "Pick the channel in the bot. Goods adds an Order button to every post.", href: botStartLink("connect"), cta: "Open the bot", external: true },
    { done: s.setup.products > 0, title: "Post your first product", body: "A photo and a price in your channel is enough. Or add one here.", href: `${base}/products/new`, cta: "Add a product" },
    { done: week.totals.views > 0, title: "Share your shop link", body: "Put it in your channel description so buyers can browse everything.", href: storeUrl, cta: "Open your shop", external: true },
  ];
  const setupDone = setup.every((x) => x.done);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-mist">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Addis_Ababa" })}</p>
          <h1 className="page-title mt-0.5">{greeting()}{me?.firstName ? `, ${me.firstName}` : ""}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}/products/new`} aria-label="Add product" className={cn(buttonVariants({ size: "lg" }), "max-sm:h-11 max-sm:w-11 max-sm:px-0")}>
            <PackagePlus size={18} strokeWidth={2.4} /> <span className="max-sm:sr-only">Add product</span>
          </Link>
        </div>
      </header>

      {!setupDone ? (
        <section className="panel overflow-hidden" aria-labelledby="setup-title">
          <div aria-hidden className="h-2 bg-brand" />
          <div className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="setup-title" className="font-display text-[22px] font-extrabold tracking-[-0.02em]">Get {shop.name} selling</h2>
              <span className="num rounded-full bg-sunken px-3 py-1 text-sm font-bold">{setup.filter((x) => x.done).length} of {setup.length} done</span>
            </div>
            <ol className="mt-3 grid gap-2 md:grid-cols-3">
              {setup.map((step, i) => (
                <li key={step.title} className={cn("flex flex-col rounded-[20px] border-2 p-4", step.done ? "border-transparent bg-sunken" : "border-line bg-surface")}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn("num grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold", step.done ? "bg-ink text-brand" : "bg-brand text-brand-fg")}>
                      {step.done ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <p className={cn("font-display text-[15px] font-bold", step.done && "text-mist line-through decoration-faint")}>{step.title}</p>
                  </div>
                  {!step.done ? (
                    <>
                      <p className="mt-2 flex-1 pl-[42px] text-[14px] font-semibold text-mist">{step.body}</p>
                      <div className="mt-3 pl-[42px]">
                        <a href={step.href} target={step.external ? "_blank" : undefined} rel={step.external ? "noreferrer" : undefined} className={buttonVariants({ size: "sm", variant: i === setup.findIndex((x) => !x.done) ? "primary" : "secondary" })}>
                          {step.cta}
                        </a>
                      </div>
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <section aria-label="This week" className="grid gap-4 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex flex-col rounded-[var(--radius-card)] bg-ink p-5 text-white sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[15px] font-semibold text-white/70">Sales, last 7 days</p>
            <Link href={`${base}/analytics`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 font-display text-[13px] font-semibold transition-colors hover:bg-white/20">
              Analytics <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </div>
          <p className="num mt-2 font-display text-[40px] font-extrabold leading-none tracking-[-0.04em] sm:text-[52px]">{money(week.totals.revenueMinor)}</p>
          <dl className="mt-auto grid grid-cols-3 gap-3 pt-6">
            {[
              { label: "Orders", value: week.totals.orders },
              { label: "Product views", value: week.totals.views },
              { label: "Questions", value: week.totals.inquiries },
            ].map((m) => (
              <div key={m.label} className="rounded-[18px] bg-white/[0.07] px-3.5 py-3">
                <dt className="text-[12px] font-bold text-white/60">{m.label}</dt>
                <dd className="num mt-0.5 font-display text-2xl font-extrabold tracking-[-0.02em]">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {urgent > 0 ? (
          <Link href={todo.find((t) => t.urgent)?.href ?? `${base}/orders`} className="group flex flex-col rounded-[var(--radius-card)] bg-brand p-5 text-brand-fg transition-transform duration-150 hover:-translate-y-0.5 sm:p-6">
            <p className="font-display text-[15px] font-bold">Needs you now</p>
            <p className="num mt-2 font-display text-[64px] font-extrabold leading-none tracking-[-0.05em]">{urgent}</p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-6">
              <span className="text-[15px] font-bold">{urgent === 1 ? "thing is waiting on you" : "things are waiting on you"}</span>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-brand transition-transform group-hover:translate-x-0.5"><ArrowRight size={20} strokeWidth={2.6} /></span>
            </div>
          </Link>
        ) : (
          <div className="flex flex-col rounded-[var(--radius-card)] bg-surface p-5 sm:p-6">
            <p className="font-display text-[15px] font-bold text-mist">Needs you now</p>
            <p className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[-0.04em]">All clear</p>
            <p className="mt-auto pt-6 text-[15px] font-semibold text-mist">New orders and buyer messages land here first.</p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="todo-title">
            <h2 id="todo-title" className="mb-3 font-display text-lg font-extrabold tracking-[-0.02em]">Needs you</h2>
            {todo.length ? (
              <ul className="panel divide-y divide-line overflow-hidden">
                {todo.map((t) => (
                  <li key={t.href + t.label}>
                    <Link href={t.href} className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-canvas sm:px-5">
                      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", t.urgent ? "bg-brand text-brand-fg" : "bg-sunken text-ink")}>
                        <t.icon size={19} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1 text-[15px]">
                        <b className="num font-display text-xl font-extrabold">{t.n}</b> <span className="font-semibold text-ink-soft">{t.label}</span>
                      </span>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken transition-[transform,background-color] group-hover:translate-x-0.5 group-hover:bg-ink group-hover:text-white"><ChevronRight size={17} strokeWidth={2.4} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel flex items-center gap-3.5 px-4 py-4 sm:px-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check size={20} strokeWidth={2.6} /></span>
                <p className="text-[15px] font-semibold text-ink-soft">Nothing waiting on you. New orders and messages show up here first.</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="perf-title">
            <div className="panel-head">
              <h2 id="perf-title" className="panel-title">Sales trend</h2>
              <Link href={`${base}/analytics`} className="flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline">
                Analytics <ArrowRight size={14} />
              </Link>
            </div>
            <div className="px-4 pb-4 pt-3 sm:px-5">
              <TrendChart
                points={week.points.map((p) => ({ day: p.day, value: Number(p.revenueMinor), secondary: p.orders }))}
                kind="money"
                currency={shop.currency}
                secondaryLabel="orders"
                height={150}
                summary={`Sales over the last 7 days: ${money(week.totals.revenueMinor)} from ${week.totals.orders} orders.`}
              />
            </div>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="recent-title">
            <div className="panel-head">
              <h2 id="recent-title" className="panel-title">Recent orders</h2>
              <Link href={`${base}/orders`} className="flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline">
                All orders <ArrowRight size={14} />
              </Link>
            </div>
            {recent.items.length ? (
              <ul className="divide-y divide-line">
                {recent.items.map((raw) => {
                  const o = serializeOrder(raw);
                  return (
                    <li key={o.id}>
                      <Link href={`${base}/orders/${o.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-canvas sm:grid-cols-[64px_minmax(0,1fr)_auto_112px] sm:px-5">
                        <span className="num font-display text-sm font-bold">#{o.number}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-display text-[15px] font-semibold">{o.contactName}</span>
                          <span className="block truncate text-[13px] font-semibold text-mist">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}, {timeAgo(o.placedAt)}</span>
                        </span>
                        <span className="num text-right font-display text-[15px] font-extrabold">{formatMoney(BigInt(o.totalMinor), o.currency)}</span>
                        <span className="col-start-3 row-start-2 mt-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:mt-0"><OrderStatus status={o.status} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-mist">Orders appear here the moment a buyer taps Order on one of your posts.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel" aria-labelledby="tg-title">
            <div className="panel-head">
              <h2 id="tg-title" className="panel-title flex items-center gap-2"><Send size={15} className="text-telegram" /> Telegram</h2>
              <Link href={`${base}/telegram`} className="text-[13px] font-semibold text-brand-ink hover:underline">Manage</Link>
            </div>
            {connected.length ? (
              <ul className="divide-y divide-line">
                {connected.map((c) => {
                  const healthy = c.botIsAdmin && (c.chatType !== "channel" || c.canEditMessages);
                  const link = c.username ? `https://t.me/${c.username}` : postLink({ chatId: c.telegramChatId, messageId: 1 });
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-telegram-soft font-display text-base font-bold text-[#0d5f87]">
                        {(c.title ?? "?").slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[15px] font-bold">{c.title}</span>
                        <span className={cn("flex items-center gap-1.5 text-xs", healthy ? "text-mist" : "font-medium text-adey-ink")}>
                          <span className={cn("h-2 w-2 rounded-full", healthy ? "bg-success-dot" : "bg-adey")} />
                          {healthy ? (c.lastPostAt ? `Last post ${timeAgo(c.lastPostAt)}` : "Listening for posts") : "Needs admin rights"}
                        </span>
                      </span>
                      {link ? <a href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-telegram hover:underline">Open</a> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-4 sm:px-5">
                <p className="text-sm text-mist">Connect a channel or group and every post with a photo and a price becomes a product.</p>
                <a href={botStartLink("connect")} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "telegram", size: "sm" }), "mt-3")}>
                  <Send size={14} /> Connect in Telegram
                </a>
              </div>
            )}
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="share-title">
            <h2 id="share-title" className="panel-title flex items-center gap-2"><Share2 size={15} className="text-mist" /> Your shop link</h2>
            <p className="mt-1 text-[13px] text-mist">Pin it in your channel so buyers can see everything you sell.</p>
            <div className="mt-3 flex items-center gap-2 rounded-full bg-sunken py-1.5 pl-4 pr-1.5">
              <a href={storeUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-display text-sm font-semibold hover:underline">{storefrontHost(shop.handle)}</a>
              <CopyButton value={storeUrl} />
            </div>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(storeUrl)}&text=${encodeURIComponent(`Shop ${shop.name} online`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-telegram hover:underline"
            >
              <Send size={13} /> Share in Telegram
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}
