"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type HeroSlideView = {
  id: string | number;
  eyebrow: string | null;
  title: string;
  text: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

const INTERVAL_MS = 5000;

/**
 * Carrousel de la page d'accueil : une diapositive toutes les 5 secondes, en fondu.
 * La rotation s'arrête au survol, au focus clavier, et via le bouton pause (exigence d'accessibilité
 * pour tout contenu qui défile seul).
 */
export function HeroCarousel({ slides }: { slides: HeroSlideView[] }) {
  const t = useTranslations("home.carousel");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (count < 2 || paused || hovered) return;
    // Relancé à chaque changement de diapositive : un clic sur un point redonne 5 s pleines.
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [index, count, paused, hovered]);

  if (count === 0) return null;
  const go = (next: number) => setIndex((next + count) % count);

  return (
    <section
      className="relative h-80 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 shadow-sm sm:h-96"
      aria-roledescription="carousel"
      aria-label={t("label")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      {slides.map((slide, position) => {
        const active = position === index;
        const external = slide.ctaUrl ? /^https?:/i.test(slide.ctaUrl) : false;
        return (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={t("slideOf", { current: position + 1, total: count })}
            aria-hidden={!active}
            inert={!active}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading={position === 0 ? "eager" : "lazy"}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/5 rtl:bg-gradient-to-l" />
            <div className="relative flex h-full max-w-xl flex-col justify-center px-6 pb-10 sm:px-10">
              {slide.eyebrow ? <p className="eyebrow text-amber-300">{slide.eyebrow}</p> : null}
              <h1 className="mt-2 text-2xl leading-tight font-black tracking-tight text-white sm:text-4xl">
                {slide.title}
              </h1>
              {slide.text ? <p className="mt-3 line-clamp-4 text-sm text-zinc-100 sm:text-base">{slide.text}</p> : null}
              {slide.ctaLabel && slide.ctaUrl ? (
                <div className="mt-5">
                  {external ? (
                    <a href={slide.ctaUrl} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                      {slide.ctaLabel}
                    </a>
                  ) : (
                    <Link href={slide.ctaUrl} className="btn btn-primary">
                      {slide.ctaLabel}
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {count > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 px-4">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/85 text-sm text-zinc-800 shadow transition hover:bg-white"
            aria-label={t("previous")}
          >
            <span className="rtl:rotate-180" aria-hidden="true">
              ‹
            </span>
          </button>
          <div className="flex items-center gap-1.5">
            {slides.map((slide, position) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(position)}
                aria-label={t("goTo", { number: position + 1 })}
                aria-current={position === index}
                className={`h-2 rounded-full transition-all ${
                  position === index ? "w-6 bg-amber-400" : "w-2 bg-white/70 hover:bg-white"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/85 text-sm text-zinc-800 shadow transition hover:bg-white"
            aria-label={t("next")}
          >
            <span className="rtl:rotate-180" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/85 text-[10px] text-zinc-800 shadow transition hover:bg-white"
            aria-label={paused ? t("play") : t("pause")}
            aria-pressed={paused}
          >
            <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
