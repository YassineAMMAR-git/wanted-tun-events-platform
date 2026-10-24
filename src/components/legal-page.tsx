import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";
import { LEGAL_VERSION } from "@/lib/site";

/**
 * Mise en page commune des pages légales. Les textes sont rédigés en français, version qui fait foi
 * (le site s'adresse à un public en France) ; un bandeau le signale aux visiteurs qui ont choisi une autre langue.
 */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal")]);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {t("updated", { date: formatDate(new Date(`${LEGAL_VERSION}T12:00:00Z`), locale) })}
        </p>
      </header>

      {locale === "fr" ? null : (
        <p lang={locale} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          ℹ️ {t("frenchOnly")}
        </p>
      )}

      <div lang="fr" dir="ltr" className="legal-content card space-y-6 p-5 text-sm leading-relaxed text-zinc-700 sm:p-7">
        {children}
      </div>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
        <Link href="/mentions-legales" className="hover:text-gold-dark">
          {t("legalNotice")}
        </Link>
        <Link href="/confidentialite" className="hover:text-gold-dark">
          {t("privacy")}
        </Link>
        <Link href="/conditions-generales" className="hover:text-gold-dark">
          {t("terms")}
        </Link>
      </nav>
    </article>
  );
}

/** Section numérotée d'une page légale (titre ancré, pour les liens directs). */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-2.5">
      <h2 className="text-base font-bold text-zinc-900 sm:text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** Valeur à compléter dans src/lib/site.ts : rendue seulement si elle est renseignée. */
export function LegalField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <li>
      <strong className="text-zinc-900">{label} :</strong> {value}
    </li>
  );
}
