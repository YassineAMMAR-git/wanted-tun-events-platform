import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import SiteHeader from "@/components/site-header";
import { localeDirection } from "@/i18n/config";
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
            <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-3 sm:px-6">
              <div>
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
                <p className="mb-2 font-semibold text-zinc-700">{t("footer.contact")}</p>
                <ul className="space-y-1 text-zinc-500">
                  <li dir="ltr" className="text-start">
                    contact@wantedtun.tn
                  </li>
                  <li dir="ltr" className="text-start">
                    +33 1 23 45 67 89
                  </li>
                  <li>{t("footer.city")}</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
              {t("footer.rights", { year: new Date().getFullYear() })}
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
