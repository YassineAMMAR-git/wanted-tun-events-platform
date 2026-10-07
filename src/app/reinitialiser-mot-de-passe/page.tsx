import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { checkPasswordResetToken } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ResetPasswordForm } from "@/app/reinitialiser-mot-de-passe/reset-form";

export const dynamic = "force-dynamic";

// L'adresse contient le lien secret : elle ne doit être ni indexée ni transmise à un autre site.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const [t, state] = await Promise.all([getTranslations("auth"), checkPasswordResetToken(token)]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <p className="eyebrow">{t("forgot.eyebrow")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900">{t("reset.title")}</h1>
        {state === "valid" ? <p className="mt-2 text-sm text-zinc-600">{t("reset.intro")}</p> : null}
      </div>

      <Card>
        {state === "valid" ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4">
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              ⚠️ {state === "expired" ? t("reset.expired") : t("reset.invalid")}
            </div>
            <Link href="/mot-de-passe-oublie" className="btn btn-primary w-full">
              {t("reset.requestNew")}
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
