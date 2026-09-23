import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";

const publicLinks = [
  { href: "/", key: "home" },
  { href: "/activites", key: "activities" },
  { href: "/abonnements", key: "plans" },
] as const;

export default async function SiteHeader() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("nav")]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0d]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label={t("homeLink")}>
          {/* Même fichier que l'icône du navigateur (src/app/favicon.ico), servi par Next.js sur /favicon.ico */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />
          <span className="leading-tight" dir="ltr">
            <span className="block text-[13px] font-black tracking-[0.2em] text-white">WANTED</span>
            <span className="block text-[10px] font-semibold tracking-[0.28em] text-amber-300/90">TUN EVENTS</span>
          </span>
        </Link>

        <nav className="ms-4 hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/6 hover:text-white"
            >
              {t(link.key)}
            </Link>
          ))}
          {user ? (
            <Link
              href="/espace-personnel"
              className="rounded-full px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/6 hover:text-white"
            >
              {t("mySpace")}
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link
              href="/admin"
              className="rounded-full px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-300/10"
            >
              {t("admin")}
            </Link>
          ) : null}
        </nav>

        <div className="ms-auto hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          {user ? (
            <>
              <span className="max-w-[10rem] truncate text-sm text-zinc-400">
                {user.firstName} {user.lastName}
              </span>
              <form action={logoutAction}>
                <button className="btn btn-ghost btn-sm" type="submit">
                  {t("logout")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/connexion" className="btn btn-ghost btn-sm">
                {t("login")}
              </Link>
              <Link href="/inscription" className="btn btn-primary btn-sm">
                {t("register")}
              </Link>
            </>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <details>
            <summary className="btn btn-ghost btn-sm list-none">{t("menu")}</summary>
            <div className="absolute start-2 end-2 mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#121216] p-3 shadow-2xl">
              {publicLinks.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/6">
                  {t(link.key)}
                </Link>
              ))}
              {user ? (
                <Link href="/espace-personnel" className="rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/6">
                  {t("mySpace")}
                </Link>
              ) : null}
              {user?.role === "admin" ? (
                <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300/10">
                  {t("admin")}
                </Link>
              ) : null}
              {user ? (
                <form action={logoutAction}>
                  <button className="btn btn-ghost btn-sm mt-1 w-full" type="submit">
                    {t("logout")}
                  </button>
                </form>
              ) : (
                <div className="mt-1 flex gap-2">
                  <Link href="/connexion" className="btn btn-ghost btn-sm flex-1">
                    {t("login")}
                  </Link>
                  <Link href="/inscription" className="btn btn-primary btn-sm flex-1">
                    {t("registerShort")}
                  </Link>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
