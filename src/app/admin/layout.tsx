import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

const links = [
  { href: "/admin", key: "dashboard", icon: "📊" },
  { href: "/admin/clients", key: "clients", icon: "👥" },
  { href: "/admin/categories", key: "categories", icon: "🗂️" },
  { href: "/admin/activites", key: "activities", icon: "🎯" },
  { href: "/admin/seances", key: "sessions", icon: "🗓️" },
  { href: "/admin/abonnements", key: "plans", icon: "💳" },
  { href: "/admin/notifications", key: "notifications", icon: "✉️" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const admin = await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-black text-white">{t("title")}</h1>
        </div>
        <p className="text-sm text-zinc-400">{t("connectedAs", { name: `${admin.firstName} ${admin.lastName}` })}</p>
      </div>

      <nav className="scroll-x">
        <ul className="flex min-w-max gap-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200"
              >
                <span>{link.icon}</span>
                {t(`nav.${link.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
