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
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
          <footer className="mt-10 border-t border-white/8 bg-black/30">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-white">{t("common.brand")}</p>
                <p className="mt-2 text-sm text-zinc-500">{t("footer.tagline")}</p>
              </div>
              <div className="text-sm">
                <p className="mb-2 font-semibold text-zinc-300">{t("footer.platform")}</p>
                <ul className="space-y-1 text-zinc-500">
                  <li>
                    <Link href="/activites" className="hover:text-amber-300">
                      {t("footer.allActivities")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/abonnements" className="hover:text-amber-300">
                      {t("footer.plans")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/espace-personnel" className="hover:text-amber-300">
                      {t("footer.mySpace")}
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="text-sm">
                <p className="mb-2 font-semibold text-zinc-300">{t("footer.contact")}</p>
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
            <div className="border-t border-white/6 px-4 py-4 text-center text-xs text-zinc-600">
              {t("footer.rights", { year: new Date().getFullYear() })}
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
