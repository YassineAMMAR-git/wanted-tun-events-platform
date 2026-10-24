import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import SiteHeader from "@/components/site-header";
import { localeDirection } from "@/i18n/config";
import { CONTACT_EMAIL, CONTACT_PHONE, SOCIAL_LINKS } from "@/lib/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations();

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body className="antialiased">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="mt-10 border-t border-zinc-200 bg-zinc-50">
            {/* Téléphone : « Plateforme » et « Suivez-nous » côte à côte, pour un pied de page plus court. */}
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div className="col-span-2 lg:col-span-1">
                <p className="text-sm font-black tracking-[0.2em] text-zinc-900">{t("common.brand")}</p>
                <p className="mt-2 text-sm text-zinc-500">{t("footer.tagline")}</p>
              </div>
              <div className="text-sm">
                <p className="mb-2 font-semibold text-zinc-700">{t("footer.platform")}</p>
                <ul className="space-y-1 text-zinc-500">
                  <li>
                    <Link href="/activites" className="hover:text-gold-dark">
                      {t("footer.allActivities")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/abonnements" className="hover:text-gold-dark">
                      {t("footer.plans")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/espace-personnel" className="hover:text-gold-dark">
                      {t("footer.mySpace")}
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="text-sm">
                <p className="mb-2 font-semibold text-zinc-700">{t("footer.follow")}</p>
                <div className="flex gap-2">
                  <a
                    href={SOCIAL_LINKS.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("footer.onInstagram")}
                    title="Instagram"
                    className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:border-amber-300 hover:text-gold-dark"
                  >
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a
                    href={SOCIAL_LINKS.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("footer.onFacebook")}
                    title="Facebook"
                    className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:border-amber-300 hover:text-gold-dark"
                  >
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
                      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
                    </svg>
                  </a>
                </div>
              </div>
              <div className="col-span-2 text-sm sm:col-span-1">
                <p className="mb-2 font-semibold text-zinc-700">{t("footer.contact")}</p>
                <ul className="space-y-1 text-zinc-500">
                  <li dir="ltr" className="text-start">
                    <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gold-dark">
                      {CONTACT_EMAIL}
                    </a>
                  </li>
                  <li dir="ltr" className="text-start">
                    <a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`} className="hover:text-gold-dark">
                      {CONTACT_PHONE}
                    </a>
                  </li>
                  <li>{t("footer.city")}</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-zinc-200 px-4 py-5 text-center text-xs text-zinc-500">
              <p className="mx-auto max-w-3xl">
                🔒{" "}
                {t.rich("footer.privacyStatement", {
                  link: (chunks) => (
                    <Link href="/confidentialite" className="font-semibold text-zinc-600 underline hover:text-gold-dark">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              <nav aria-label={t("footer.legal")} className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
                <Link href="/mentions-legales" className="hover:text-gold-dark">
                  {t("footer.legalNotice")}
                </Link>
                <Link href="/confidentialite" className="hover:text-gold-dark">
                  {t("footer.privacy")}
                </Link>
                <Link href="/conditions-generales" className="hover:text-gold-dark">
                  {t("footer.terms")}
                </Link>
                <Link href="/confidentialite#cookies" className="hover:text-gold-dark">
                  {t("footer.cookies")}
                </Link>
              </nav>
              <p className="mt-3 text-zinc-400">{t("footer.rights", { year: new Date().getFullYear() })}</p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
