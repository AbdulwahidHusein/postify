import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  BarChart3, Check, ChevronDown, Languages, MessageCircle, MousePointerClick, Send, ShoppingBag, Store, X,
} from "lucide-react";
import { botStartLink } from "@/server/services/telegram";
import { asLocale, type Locale } from "@/i18n";
import { tc } from "@/i18n/catalog";
import { MiniAppEntry } from "@/components/auth/mini-app-entry";
import { GoodsLogo } from "@/components/brand";
import { LangToggle } from "@/components/store/lang-toggle";
import { DashboardWindow, OrderToast, TelegramPhone, landingT } from "@/components/landing/mockups";
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
  return { title: { absolute: t("meta_title") }, description: t("meta_description") };
}

function Cta({ href, children, size = "lg", variant = "primary", className }: { href: string; children: React.ReactNode; size?: "md" | "lg"; variant?: "primary" | "secondary" | "light"; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold transition-colors",
        size === "lg" ? "h-12 px-5 text-[15px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-brand text-brand-fg shadow-[inset_0_-1px_0_rgb(0_0_0/0.2),0_8px_20px_-8px_rgb(14_107_78/0.6)] hover:bg-brand-hover",
        variant === "secondary" && "bg-white text-ink ring-1 ring-line-strong hover:bg-canvas",
        variant === "light" && "bg-white text-ink hover:bg-white/90",
        className,
      )}
    >
      {children}
    </a>
  );
}

function SectionHead({ title, sub, center }: { title: string; sub?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <h2 className="font-display text-[32px] font-bold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[40px]">{title}</h2>
      {sub ? <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export default async function Landing() {
  const locale = await landingLocale();
  const t = landingT(locale);
  const start = botStartLink("connect");

  const features = [
    { icon: MousePointerClick, title: t("feat_order_title"), body: t("feat_order_body") },
    { icon: Languages, title: t("feat_ai_title"), body: t("feat_ai_body") },
    { icon: ShoppingBag, title: t("feat_orders_title"), body: t("feat_orders_body") },
    { icon: Store, title: t("feat_store_title"), body: t("feat_store_body") },
    { icon: MessageCircle, title: t("feat_inbox_title"), body: t("feat_inbox_body") },
    { icon: BarChart3, title: t("feat_stats_title"), body: t("feat_stats_body") },
  ];
  const steps = [
    { title: t("how_1_title"), body: t("how_1_body") },
    { title: t("how_2_title"), body: t("how_2_body") },
    { title: t("how_3_title"), body: t("how_3_body") },
  ];
  const faq = ["website", "buyers", "paid", "group", "edit", "free"].map((k) => ({ q: t(`faq_${k}_q`), a: t(`faq_${k}_a`) }));

  return (
    <div lang={locale} className="min-h-dvh bg-white text-ink">
      <MiniAppEntry />

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5" aria-label="Main">
          <Link href="/" aria-label="Goods home"><GoodsLogo /></Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-ink-soft md:flex">
            <a href="#how" className="hover:text-ink">{t("nav_how")}</a>
            <a href="#features" className="hover:text-ink">{t("nav_features")}</a>
            <a href="#pricing" className="hover:text-ink">{t("nav_pricing")}</a>
            <a href="#faq" className="hover:text-ink">{t("nav_faq")}</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle locale={locale} />
            <Link href="/login" className="hidden h-10 items-center rounded-[10px] px-3 text-sm font-semibold text-ink-soft hover:text-ink sm:inline-flex">
              {tc_sign(locale)}
            </Link>
            <Cta href={start} size="md">{t("cta_start")}</Cta>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_70%_20%,rgb(14_107_78/0.08),transparent_70%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1.02fr_1fr] lg:gap-6 lg:pb-28 lg:pt-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t("hero_badge")}
              </span>
              <h1 className="mt-5 font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[52px] xl:text-[56px]">{t("hero_title")}</h1>
              <p className="mt-5 max-w-[34rem] text-[18px] leading-relaxed text-ink-soft">{t("hero_sub")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Cta href={start}><Send size={17} /> {t("cta_primary")}</Cta>
                <Cta href="#how" variant="secondary">{t("cta_secondary")}</Cta>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-ink-soft">
                {["trust_setup", "trust_website", "trust_languages"].map((k) => (
                  <li key={k} className="flex items-center gap-1.5"><Check size={16} className="text-brand-ink" strokeWidth={2.5} /> {t(k)}</li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto h-[580px] w-full max-w-[400px] lg:-mr-12 lg:max-w-none" aria-hidden>
              <DashboardWindow locale={locale} className="absolute right-0 top-0 hidden w-[468px] lg:block" />
              <TelegramPhone locale={locale} className="absolute left-1/2 top-0 -translate-x-1/2 lg:-left-14 lg:top-16 lg:translate-x-0" />
              <OrderToast locale={locale} className="absolute right-0 top-[150px] lg:bottom-6 lg:right-0 lg:top-auto" />
            </div>
          </div>
        </section>

        {/* Before / after */}
        <section className="border-t border-line bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead title={t("pain_title")} sub={t("pain_sub")} />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-[20px] bg-white p-6 ring-1 ring-line sm:p-8">
                <p className="text-sm font-semibold text-mist">{t("pain_before")}</p>
                <ul className="mt-5 space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <li key={i} className="flex gap-3 text-[16px] text-ink-soft">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-mist"><X size={12} strokeWidth={3} /></span>
                      {t(`pain_${i}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[20px] bg-white p-6 ring-2 ring-brand sm:p-8">
                <p className="text-sm font-semibold text-brand-ink">{t("pain_after")}</p>
                <ul className="mt-5 space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <li key={i} className="flex gap-3 text-[16px] font-medium text-ink">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-fg"><Check size={12} strokeWidth={3} /></span>
                      {t(`gain_${i}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead title={t("how_title")} />
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s, i) => (
                <li key={s.title} className="relative">
                  <div className="flex items-center gap-4">
                    <span className="num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink font-display text-[15px] font-bold text-white">{i + 1}</span>
                    {i < steps.length - 1 ? <span aria-hidden className="hidden h-px flex-1 bg-line-strong md:block" /> : null}
                  </div>
                  <h3 className="mt-5 font-display text-[20px] font-bold">{s.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-line bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead title={t("feat_title")} sub={t("feat_sub")} />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="rounded-[20px] bg-white p-6 ring-1 ring-line sm:p-7">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand-ink"><f.icon size={19} /></span>
                  <h3 className="mt-5 font-display text-[18px] font-bold">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Dashboard showcase */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <div>
              <SectionHead title={t("show_title")} sub={t("show_sub")} />
              <ul className="mt-8 space-y-3.5">
                {["show_1", "show_2", "show_3"].map((k) => (
                  <li key={k} className="flex gap-3 text-[16px] text-ink">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-fg"><Check size={12} strokeWidth={3} /></span>
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden className="rounded-[28px] bg-canvas p-4 ring-1 ring-line sm:p-8">
              <DashboardWindow locale={locale} />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-line bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead title={t("price_title")} sub={t("price_sub")} center />
            <div className="mx-auto mt-12 max-w-md rounded-[24px] bg-white p-8 ring-1 ring-line shadow-[0_30px_60px_-40px_rgb(15_23_20/0.35)]">
              <div className="flex items-center justify-between">
                <p className="font-display text-[18px] font-bold">{t("price_plan")}</p>
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-ink">{t("hero_badge")}</span>
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="num font-display text-[48px] font-bold leading-none tracking-[-0.03em]">{t("price_amount")}</span>
                <span className="text-ink-soft">{t("price_period")}</span>
              </p>
              <ul className="mt-6 space-y-3 border-t border-line pt-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="flex gap-3 text-[15px]">
                    <Check size={18} className="shrink-0 text-brand-ink" strokeWidth={2.5} /> {t(`price_${i}`)}
                  </li>
                ))}
              </ul>
              <Cta href={start} className="mt-8 w-full"><Send size={17} /> {t("cta_primary")}</Cta>
              <p className="mt-4 text-center text-[13px] leading-relaxed text-mist">{t("price_note")}</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16">
          <div className="mx-auto max-w-3xl px-5 py-20 lg:py-24">
            <SectionHead title={t("faq_title")} center />
            <div className="mt-10 divide-y divide-line border-y border-line">
              {faq.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown size={18} className="shrink-0 text-mist transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="pb-5 pr-10 text-[16px] leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-5 pb-20">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-ink px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[40px]">{t("final_title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-[17px] text-white/70">{t("final_sub")}</p>
            <div className="mt-8 flex justify-center">
              <Cta href={start}><Send size={17} /> {t("cta_primary")}</Cta>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-mist sm:flex-row sm:items-center sm:justify-between">
          <GoodsLogo size={20} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#faq" className="hover:text-ink">{t("nav_faq")}</a>
            <Link href="/login" className="hover:text-ink">{tc_sign(locale)}</Link>
            <span>{t("footer_made")}</span>
            <span>{t("footer_rights", { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function tc_sign(locale: Locale) {
  return tc(locale, "common.sign");
}
