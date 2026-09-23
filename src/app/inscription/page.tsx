import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Card } from "@/components/ui";
import { RegisterForm } from "@/app/inscription/register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (user) redirect("/espace-personnel");
  const t = await getTranslations("auth.register");

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="text-center">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-black text-white">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("intro")}</p>
      </div>

      <Card>
        <RegisterForm />
        <p className="mt-4 text-center text-sm text-zinc-400">
          {t("already")}{" "}
          <Link href="/connexion" className="font-semibold text-amber-300 hover:underline">
            {t("login")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
