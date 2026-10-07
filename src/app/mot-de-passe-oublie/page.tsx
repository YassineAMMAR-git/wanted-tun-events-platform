import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "@/app/mot-de-passe-oublie/forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <p className="eyebrow">{t("forgot.eyebrow")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900">{t("forgot.title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("forgot.intro")}</p>
      </div>

      <Card>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm text-zinc-600">
          <Link href="/connexion" className="font-semibold text-gold-dark hover:underline">
            {t("forgot.backToLogin")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
