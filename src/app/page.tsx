import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  ArrowRight, BarChart3, Check, Languages, MessageCircle, MousePointerClick, Paintbrush, Plus, Send, ShoppingBag, Store, X,
} from "lucide-react";
import { botStartLink } from "@/server/services/telegram";
import { asLocale, type Locale } from "@/i18n";
import { tc } from "@/i18n/catalog";
import { MiniAppEntry } from "@/components/auth/mini-app-entry";
import { GoodsLogo, GoodsMark } from "@/components/brand";
import { LangToggle } from "@/components/store/lang-toggle";
import { landingT } from "@/components/landing/mockups";
import { CaptionToProduct, CheckItem, ConfirmCard, DashboardScene, OrderPing, StorePhone, TelegramPost } from "@/components/landing/scenes";
import { cn } from "@/lib/utils";

async function landingLocale(): Promise<Locale> {
  const jar = await cookies();
  const saved = jar.get("goods_lang")?.value;
  if (saved) return asLocale(saved);
  const accept = (await headers()).get("accept-language") ?? "";
  return /^am\b|,\s*am\b/i.test(accept) ? "am" : "en";
}

export async function generateMetadata() {
  const t = landingT(await landingLocale());
  return { title: { absolute: t("meta_title") }, description: t("meta_description_v2") };
}

function Cta({ href, children, variant = "primary", className }: { href: string; children: React.ReactNode; variant?: "primary" | "ghost" | "light" | "ink"; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex h-14 items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-7 font-display text-[16px] font-bold transition-[transform,box-shadow,background-color] duration-150",
        variant === "primary" && "bg-brand text-brand-fg shadow-[0_4px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--ink)] active:translate-y-1 active:shadow-none",
        variant === "ghost" && "border-2 border-ink bg-transparent text-ink hover:bg-ink hover:text-white",
        variant === "light" && "bg-white text-ink hover:-translate-y-0.5",
        variant === "ink" && "bg-ink text-white hover:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </a>
  );
}

function Kicker({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-[13px] font-bold", dark ? "bg-white/10 text-white" : "bg-white text-ink ring-1 ring-line")}>
      <span className="h-2 w-2 rounded-full bg-brand" /> {children}
    </span>
  );
}

function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[52px]", className)}>{children}</h2>;
}

export default async function Landing() {
  const locale = await landingLocale();
  const t = landingT(locale);
  const start = botStartLink("connect");
  const signIn = tc(locale, "common.sign");

  const faq = ["website", "buyers", "paid", "group", "edit"].map((k) => ({ q: t(`faq_${k}_q`), a: t(`faq_${k}_a`) }));
  const marquee = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`marquee_${i}`));

  return (
    <div lang={locale} className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <MiniAppEntry />

      {/* ── Navigation ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-canvas/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-[72px] max-w-7xl items-center gap-6 px-5" aria-label="Main">
          <Link href="/" aria-label="Goods home"><GoodsLogo size={30} /></Link>
          <div className="ml-4 hidden items-center gap-1 rounded-full bg-surface p-1 lg:flex">
            {[["#how", "nav_how"], ["#features", "nav_features"], ["#designer", "nav_designer"], ["#faq", "nav_faq"]].map(([href, k]) => (
              <a key={k} href={href} className="rounded-full px-4 py-2 font-display text-[14px] font-semibold text-ink-soft transition-colors hover:bg-sunken hover:text-ink">{t(k)}</a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle locale={locale} />
            <Link href="/login" className="hidden h-11 items-center rounded-full px-4 font-display text-[14px] font-bold text-ink hover:bg-surface sm:inline-flex">{signIn}</Link>
            <a href={start} className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 font-display text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5 sm:px-5">
              {t("cta_open")} <ArrowRight size={16} strokeWidth={2.6} className="hidden sm:block" />
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="relative">
          <div className="mx-auto max-w-7xl px-5 pb-10 pt-10 sm:pt-16 lg:pt-20">
            <div className="landing-rise mx-auto max-w-4xl text-center">
              <Kicker>{t("hero_kicker")}</Kicker>
              <h1 className="mt-6 font-display text-[46px] font-extrabold leading-[0.98] tracking-[-0.05em] sm:text-[72px] lg:text-[88px]">
                {t("hero_title_a")}{" "}
                <span className="relative inline-block whitespace-nowrap">
                  <span className="relative z-10">{t("hero_title_b")}</span>
                  <span aria-hidden className="absolute inset-x-[-0.06em] bottom-[0.06em] z-0 h-[0.32em] rounded-full bg-brand" />
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-[18px] font-semibold leading-relaxed text-ink-soft sm:text-[20px]">{t("hero_sub")}</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Cta href={start}><Send size={18} strokeWidth={2.4} /> {t("cta_open_tg")}</Cta>
                <Cta href="#how" variant="ghost">{t("cta_secondary")}</Cta>
              </div>
              <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] font-bold text-ink-soft">
                {["trust_setup", "trust_website", "trust_languages"].map((k) => (
                  <li key={k} className="flex items-center gap-2"><Check size={16} className="text-brand-ink" strokeWidth={3} /> {t(k)}</li>
                ))}
              </ul>
            </div>

            {/* Stage: post → order → store */}
            <div className="relative mx-auto mt-14 max-w-6xl">
              <div className="relative overflow-hidden rounded-[36px] bg-ink px-5 pb-10 pt-10 sm:rounded-[48px] sm:px-10 sm:pt-14">
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
                <div className="relative grid items-start gap-10 lg:grid-cols-3">
                  <div className="landing-rise flex flex-col items-center gap-4 [animation-delay:120ms]">
                    <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-white/50">1 · {t("stage_post")}</span>
                    <TelegramPost locale={locale} />
                  </div>
                  <div className="landing-rise flex flex-col items-center gap-4 [animation-delay:360ms]">
                    <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-white/50">2 · {t("stage_order")}</span>
                    <OrderPing locale={locale} />
                    <div aria-hidden className="w-[300px] rounded-[22px] bg-white/[0.06] p-4 text-white ring-1 ring-white/10">
                      <div className="flex items-center justify-between font-display text-[13px] font-bold text-white/60"><span>{t("mock_sales")}</span><span className="text-brand">+12%</span></div>
                      <p className="mt-1 font-display text-[34px] font-extrabold tracking-[-0.04em]">{locale === "am" ? "48,250 ብር" : "ETB 48,250"}</p>
                      <div className="mt-3 flex h-12 items-end gap-1.5">{[38, 55, 47, 70, 62, 100, 66].map((h, i) => <span key={i} className={cn("flex-1 rounded-[4px]", i === 5 ? "bg-brand" : "bg-white/15")} style={{ height: `${h}%` }} />)}</div>
                    </div>
                  </div>
                  <div className="landing-rise flex flex-col items-center gap-4 [animation-delay:600ms]">
                    <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-white/50">3 · {t("stage_store")}</span>
                    <StorePhone locale={locale} theme="bold" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee: what people sell ─────────────────────────────── */}
        <section aria-label={t("marquee_label")} className="overflow-hidden border-y border-line bg-surface py-5">
          <div className="landing-marquee flex w-max gap-10 whitespace-nowrap font-display text-[22px] font-extrabold tracking-[-0.02em] sm:text-[28px]">
            {[...marquee, ...marquee].map((w, i) => (
              <span key={i} aria-hidden={i >= marquee.length} className="flex items-center gap-10">
                {w} <GoodsMark size={22} tone="coral" />
              </span>
            ))}
          </div>
        </section>

        {/* ── Before / after ───────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:py-32">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <Kicker>{t("pain_kicker")}</Kicker>
              <H2 className="mt-5">{t("pain_title")}</H2>
            </div>
            <p className="text-[19px] font-semibold leading-relaxed text-ink-soft">{t("pain_sub")}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-[32px] bg-surface p-7 sm:p-9">
              <p className="font-display text-[15px] font-bold text-mist">{t("pain_before")}</p>
              <ul className="mt-6 space-y-5">
                {[1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-start gap-3 text-[17px] font-semibold text-ink-soft">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunken text-mist"><X size={13} strokeWidth={3} /></span>
                    <span className="line-through decoration-line-strong decoration-2">{t(`pain_${i}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[32px] bg-ink p-7 text-white sm:p-9">
              <p className="font-display text-[15px] font-bold text-brand">{t("pain_after")}</p>
              <ul className="mt-6 space-y-5 text-[17px] font-bold">
                {[1, 2, 3, 4].map((i) => <CheckItem key={i} dark>{t(`gain_${i}`)}</CheckItem>)}
              </ul>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:py-32">
            <div className="max-w-3xl">
              <Kicker>{t("nav_how")}</Kicker>
              <H2 className="mt-5">{t("how_title")}</H2>
            </div>
            <ol className="mt-14 grid gap-4 lg:grid-cols-3">
              {[
                { n: 1, scene: <ConnectScene label={t("scene_connect")} channel={t("mock_channel")} /> },
                { n: 2, scene: <CaptionToProduct locale={locale} /> },
                { n: 3, scene: <ConfirmCard locale={locale} /> },
              ].map(({ n, scene }) => (
                <li key={n} className="flex flex-col rounded-[32px] bg-canvas p-6 sm:p-8">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-brand font-display text-[20px] font-extrabold text-brand-fg">{n}</span>
                  <h3 className="mt-5 font-display text-[24px] font-extrabold tracking-[-0.03em]">{t(`how_${n}_title`)}</h3>
                  <p className="mt-2 text-[16px] font-semibold leading-relaxed text-ink-soft">{t(`how_${n}_body`)}</p>
                  <div className="mt-7 flex flex-1 items-end">{scene}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features bento ───────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:py-32">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <Kicker>{t("nav_features")}</Kicker>
              <H2 className="mt-5">{t("feat_title")}</H2>
            </div>
            <p className="text-[19px] font-semibold leading-relaxed text-ink-soft">{t("feat_sub")}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Feature className="md:col-span-4 md:row-span-2 bg-brand text-brand-fg" icon={MousePointerClick} title={t("feat_order_title")} body={t("feat_order_body")} iconClass="bg-ink text-brand" mutedClass="text-brand-fg/80">
              <div aria-hidden className="mt-auto flex flex-wrap items-end gap-4 pt-8">
                <div className="w-full max-w-[300px] rounded-[22px] bg-white p-3 text-ink shadow-[0_20px_40px_-20px_rgb(0_0_0/0.4)]">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/landing/watch.webp" alt="" className="h-14 w-14 rounded-[14px] object-cover" />
                    <span><b className="block font-display text-[15px]">{t("mock_product_watch")}</b><span className="font-display text-[14px] font-extrabold">{locale === "am" ? "7,200 ብር" : "ETB 7,200"}</span></span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 font-display text-[12.5px] font-bold">
                    <span className="grid h-10 place-items-center rounded-[12px] bg-ink text-white">{t("btn_order")}</span>
                    <span className="grid h-10 place-items-center rounded-[12px] bg-sunken">{t("btn_ask")}</span>
                    <span className="grid h-10 place-items-center rounded-[12px] bg-sunken">{t("btn_shop")}</span>
                  </div>
                </div>
                <div className="w-full max-w-[300px] rotate-2 rounded-[22px] bg-white p-3 text-ink shadow-[0_20px_40px_-20px_rgb(0_0_0/0.4)]">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/landing/perfume.webp" alt="" className="h-14 w-14 rounded-[14px] object-cover grayscale-[40%]" />
                    <span><b className="block font-display text-[15px]">{t("mock_product_perfume")}</b><span className="font-display text-[14px] font-extrabold text-mist line-through">{locale === "am" ? "3,950 ብር" : "ETB 3,950"}</span></span>
                  </div>
                  <div className="mt-3 grid h-10 place-items-center rounded-[12px] bg-sunken font-display text-[12.5px] font-bold text-mist">{t("feat_order_chip")}</div>
                </div>
              </div>
            </Feature>
            <Feature className="md:col-span-2 bg-surface" icon={Languages} title={t("feat_ai_title")} body={t("feat_ai_body")}>
              <p aria-hidden className="mt-5 flex items-center gap-2 font-display text-[15px] font-bold">
                <span lang="am" className="rounded-full bg-sunken px-3 py-1.5">ዋጋ 4500 ብር</span>
                <ArrowRight size={16} />
                <span className="rounded-full bg-ink px-3 py-1.5 text-white">ETB 4,500</span>
              </p>
            </Feature>
            <Feature className="md:col-span-2 bg-surface" icon={ShoppingBag} title={t("feat_orders_title")} body={t("feat_orders_body")} />
            <Feature className="md:col-span-2 bg-surface" icon={MessageCircle} title={t("feat_inbox_title")} body={t("feat_inbox_body")} />
            <Feature className="md:col-span-2 bg-surface" icon={Store} title={t("feat_store_title")} body={t("feat_store_body_v2")}>
              <p aria-hidden className="mt-5 inline-flex items-center gap-2 rounded-full bg-sunken py-1.5 pl-3 pr-1.5 font-display text-[13px] font-bold">
                addistech.goods.et <span className="rounded-full bg-ink px-2.5 py-1 text-white">{t("feat_store_copy")}</span>
              </p>
            </Feature>
            <Feature className="md:col-span-2 bg-ink text-white" icon={BarChart3} title={t("feat_stats_title")} body={t("feat_stats_body")} iconClass="bg-brand text-brand-fg" mutedClass="text-white/70" />
          </div>
        </section>

        {/* ── Store designer ───────────────────────────────────────── */}
        <section id="designer" className="scroll-mt-20 px-3 sm:px-5">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-ink text-white sm:rounded-[56px]">
            <div className="grid gap-12 px-6 py-16 sm:px-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
              <div>
                <Kicker dark>{t("design_kicker")}</Kicker>
                <H2 className="mt-5">{t("design_title")}</H2>
                <p className="mt-5 text-[19px] font-semibold leading-relaxed text-white/70">{t("design_sub")}</p>
                <ul className="mt-8 space-y-4 text-[17px] font-bold">
                  {[1, 2, 3].map((i) => <CheckItem key={i} dark>{t(`design_${i}`)}</CheckItem>)}
                </ul>
                <div className="mt-10"><Cta href={start} className="shadow-[0_4px_0_#000]"><Paintbrush size={18} strokeWidth={2.4} /> {t("design_cta")}</Cta></div>
              </div>
              <div aria-hidden className="relative flex h-[540px] items-center justify-center">
                <StorePhone locale={locale} theme="clean" className="absolute left-0 top-10 hidden -rotate-6 scale-[0.88] sm:block" />
                <StorePhone locale={locale} theme="night" className="absolute right-0 top-10 hidden rotate-6 scale-[0.88] sm:block" />
                <StorePhone locale={locale} theme="bold" className="relative z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Dashboard ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:py-32">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <Kicker>{t("show_kicker")}</Kicker>
              <H2 className="mt-5">{t("show_title")}</H2>
              <p className="mt-5 text-[19px] font-semibold leading-relaxed text-ink-soft">{t("show_sub_v2")}</p>
              <ul className="mt-8 space-y-4 text-[17px] font-bold">
                {[1, 2, 3].map((i) => <CheckItem key={i}>{t(`show_${i}`)}</CheckItem>)}
              </ul>
            </div>
            <DashboardScene locale={locale} className="lg:-mr-10" />
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-surface">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:py-32">
            <div>
              <Kicker>{t("nav_faq")}</Kicker>
              <H2 className="mt-5">{t("faq_title")}</H2>
            </div>
            <div className="space-y-3">
              {faq.map((f) => (
                <details key={f.q} className="group rounded-[24px] bg-canvas transition-colors open:bg-sunken">
                  <summary className="flex min-h-16 list-none items-center justify-between gap-6 px-6 py-4 text-left font-display text-[18px] font-bold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform duration-200 group-open:rotate-45"><Plus size={18} strokeWidth={2.6} /></span>
                  </summary>
                  <p className="px-6 pb-6 pr-16 text-[16px] font-semibold leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────── */}
        <section className="px-3 py-16 sm:px-5 sm:py-24">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-brand px-6 py-16 text-center text-brand-fg sm:rounded-[56px] sm:py-24">
            <GoodsMark size={64} className="mx-auto" />
            <h2 className="mx-auto mt-6 max-w-3xl font-display text-[44px] font-extrabold leading-[0.98] tracking-[-0.05em] sm:text-[72px]">{t("final_title")}</h2>
            <p className="mx-auto mt-5 max-w-xl text-[19px] font-bold opacity-80">{t("final_sub")}</p>
            <div className="mt-10 flex justify-center">
              <Cta href={start} variant="ink" className="h-16 px-9 text-[17px]"><Send size={19} strokeWidth={2.4} /> {t("cta_open_tg")}</Cta>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 pb-10 text-sm font-semibold text-mist sm:flex-row sm:items-center sm:justify-between">
          <GoodsLogo size={26} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#how" className="hover:text-ink">{t("nav_how")}</a>
            <a href="#faq" className="hover:text-ink">{t("nav_faq")}</a>
            <Link href="/login" className="hover:text-ink">{signIn}</Link>
            <span>{t("footer_made")}</span>
            <span>{t("footer_rights", { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  className, icon: Icon, title, body, children, iconClass = "bg-ink text-brand", mutedClass = "text-ink-soft",
}: { className?: string; icon: typeof Store; title: string; body: string; children?: React.ReactNode; iconClass?: string; mutedClass?: string }) {
  return (
    <article className={cn("flex flex-col rounded-[32px] p-7 sm:p-8", className)}>
      <span className={cn("grid h-12 w-12 place-items-center rounded-full", iconClass)}><Icon size={22} strokeWidth={2.2} /></span>
      <h3 className="mt-6 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em]">{title}</h3>
      <p className={cn("mt-2 text-[16px] font-semibold leading-relaxed", mutedClass)}>{body}</p>
      {children}
    </article>
  );
}

function ConnectScene({ label, channel }: { label: string; channel: string }) {
  return (
    <div aria-hidden className="w-full rounded-[20px] bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-telegram text-white"><Send size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14px] font-bold">Goods Bot</span>
          <span className="block truncate text-[12px] font-semibold text-mist">{label}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-sunken p-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-display text-[11px] font-bold text-white">AT</span>
        <span className="flex-1 truncate font-display text-[13px] font-bold">{channel}</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand"><Check size={14} strokeWidth={3} /></span>
      </div>
    </div>
  );
}
