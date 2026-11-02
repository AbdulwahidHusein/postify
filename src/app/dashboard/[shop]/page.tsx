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
          <p className="text-sm text-mist">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Addis_Ababa" })}</p>
          <h1 className="page-title mt-0.5">{greeting()}{me?.firstName ? `, ${me.firstName}` : ""}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}/products/new`} aria-label="Add product" className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-10 max-sm:w-10 max-sm:px-0")}>
            <PackagePlus size={16} /> <span className="max-sm:sr-only">Add product</span>
          </Link>
        </div>
      </header>

      {!setupDone ? (
        <section className="panel overflow-hidden" aria-labelledby="setup-title">
          <div aria-hidden className="tibeb h-3.5" />
          <div className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="setup-title" className="font-display text-lg font-semibold">Get {shop.name} selling</h2>
              <span className="num text-sm text-mist">{setup.filter((x) => x.done).length} of {setup.length} done</span>
            </div>
            <ol className="mt-3 grid gap-2 md:grid-cols-3">
              {setup.map((step, i) => (
                <li key={step.title} className={cn("flex flex-col rounded-xl border p-3.5", step.done ? "border-transparent bg-sunken" : "border-line bg-surface")}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn("num grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", step.done ? "bg-brand text-white" : "border border-line-strong text-ink-soft")}>
                      {step.done ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <p className={cn("text-sm font-semibold", step.done && "text-mist line-through decoration-faint")}>{step.title}</p>
                  </div>
                  {!step.done ? (
                    <>
                      <p className="mt-1.5 flex-1 pl-[34px] text-[13px] text-mist">{step.body}</p>
                      <div className="mt-3 pl-[34px]">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="todo-title">
            <h2 id="todo-title" className="mb-2.5 text-[15px] font-semibold">Needs you</h2>
            {todo.length ? (
              <ul className="panel divide-y divide-line overflow-hidden">
                {todo.map((t) => (
                  <li key={t.href + t.label}>
                    <Link href={t.href} className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-canvas sm:px-5">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.urgent ? "bg-adey-soft text-adey-ink" : "bg-sunken text-ink-soft")}>
                        <t.icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <b className="num font-display text-base font-semibold">{t.n}</b> <span className="text-ink-soft">{t.label}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel flex items-center gap-3.5 px-4 py-4 sm:px-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Check size={18} strokeWidth={2.5} /></span>
                <p className="text-sm text-ink-soft">Nothing waiting on you. New orders and messages show up here first.</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="perf-title">
            <div className="panel-head">
              <h2 id="perf-title" className="panel-title">Last 7 days</h2>
              <Link href={`${base}/analytics`} className="flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
                Analytics <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              {[
                { label: "Sales", value: money(week.totals.revenueMinor) },
                { label: "Orders", value: week.totals.orders },
                { label: "Product views", value: week.totals.views },
                { label: "Questions", value: week.totals.inquiries },
              ].map((m, i) => (
                <div key={m.label} className={cn("px-4 py-3 sm:px-5", i % 2 === 0 && "border-r border-line", i < 2 && "border-b border-line sm:border-b-0", i === 1 && "sm:border-r")}>
                  <p className="text-[13px] text-mist">{m.label}</p>
                  <p className="num mt-0.5 font-display text-xl font-semibold tracking-[-0.01em]">{m.value}</p>
                </div>
              ))}
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
              <Link href={`${base}/orders`} className="flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
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
                        <span className="num text-sm font-semibold">#{o.number}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{o.contactName}</span>
                          <span className="block truncate text-xs text-mist">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}, {timeAgo(o.placedAt)}</span>
                        </span>
                        <span className="num text-right text-sm font-semibold">{formatMoney(BigInt(o.totalMinor), o.currency)}</span>
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
              <Link href={`${base}/telegram`} className="text-[13px] font-semibold text-brand hover:underline">Manage</Link>
            </div>
            {connected.length ? (
              <ul className="divide-y divide-line">
                {connected.map((c) => {
                  const healthy = c.botIsAdmin && (c.chatType !== "channel" || c.canEditMessages);
                  const link = c.username ? `https://t.me/${c.username}` : postLink({ chatId: c.telegramChatId, messageId: 1 });
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-telegram-soft font-display text-sm font-bold text-[#106a96]">
                        {(c.title ?? "?").slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.title}</span>
                        <span className={cn("flex items-center gap-1.5 text-xs", healthy ? "text-mist" : "font-medium text-adey-ink")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", healthy ? "bg-brand" : "bg-adey")} />
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
            <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-control)] bg-sunken py-1.5 pl-3 pr-1.5">
              <a href={storeUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{storefrontHost(shop.handle)}</a>
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
