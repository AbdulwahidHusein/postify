"use client";

import Link from "next/link";
import { useTelegram } from "@/lib/telegram/context";
import { appName } from "@/lib/env";

export function LandingHero() {
  const { isTma, ready, user } = useTelegram();

  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="hero-grid" aria-hidden />

      <div className="hero-inner">
        <p className="hero-brand">{appName}</p>
        <h1 className="hero-title">
          Channel posts.
          <br />
          Real storefront.
        </h1>
        <p className="hero-sub">
          Add a bot to your Telegram channel. Product posts become shop pages —
          buyers open them in Telegram or on the web.
        </p>

        <div className="hero-actions">
          <Link href="/dashboard" className="btn btn-primary">
            Open dashboard
          </Link>
          <Link href="/p/demo" className="btn btn-ghost">
            See a product
          </Link>
        </div>

        <p className="hero-status" aria-live="polite">
          {!ready && "Booting…"}
          {ready && isTma && (
            <>
              Mini App · hello{user ? `, ${user.firstName}` : ""}
            </>
          )}
          {ready && !isTma && "Web · same app, browser shell"}
        </p>
      </div>
    </section>
  );
}
