import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { ProfileForm } from "@/app/espace-personnel/profil/profile-form";
import { DeleteAccountForm } from "@/app/espace-personnel/profil/delete-account-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const [locale, t, tStatus, tPrivacy] = await Promise.all([
    getLocale(),
    getTranslations("profile"),
    getTranslations("status"),
    getTranslations("privacyCenter"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <nav className="text-sm text-zinc-500">
        <Link href="/espace-personnel" className="hover:text-gold-dark">
          {t("breadcrumbHome")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-700">{t("breadcrumb")}</span>
      </nav>

      <div>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-zinc-600">
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

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">🔒 {tPrivacy("title")}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {tPrivacy.rich("intro", {
              link: (chunks) => (
                <Link href="/confidentialite" className="font-semibold text-gold-dark hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-700">{tPrivacy("exportText")}</p>
          {/* Lien de téléchargement direct : pas de navigation côté client vers une route qui renvoie un fichier. */}
          <a href="/espace-personnel/mes-donnees" className="btn btn-ghost btn-sm shrink-0" download>
            ⬇️ {tPrivacy("exportButton")}
          </a>
        </div>
        {user.role === "admin" ? null : <DeleteAccountForm />}
      </Card>
    </div>
  );
}
