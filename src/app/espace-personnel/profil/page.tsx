import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { ProfileForm } from "@/app/espace-personnel/profil/profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const [locale, t, tStatus] = await Promise.all([getLocale(), getTranslations("profile"), getTranslations("status")]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <nav className="text-sm text-zinc-500">
        <Link href="/espace-personnel" className="hover:text-amber-300">
          {t("breadcrumbHome")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">{t("breadcrumb")}</span>
      </nav>

      <div>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-black text-white">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          {t("meta", { date: formatDate(user.createdAt, locale), role: tStatus(`role.${user.role}`) })}
        </p>
      </div>

      <Card>
        <ProfileForm
          email={user.email}
          defaults={{
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone ?? "",
            city: user.city ?? "",
          }}
        />
      </Card>
    </div>
  );
}
