import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { safeRedirectPath } from "@/lib/validation/form";
import { Card } from "@/components/ui";
import { LoginForm } from "@/app/connexion/login-form";
import { ResendVerificationForm } from "@/app/connexion/resend-verification-form";

export const dynamic = "force-dynamic";

const VERIFICATION_TONES = { verified: "success", expired: "error", invalid: "error" } as const;
type VerificationResult = keyof typeof VERIFICATION_TONES;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; next?: string; verification?: string }>;
}) {
  await ensureSeeded();
  const { erreur, next, verification } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeRedirectPath(next, user.role === "admin" ? "/admin" : "/espace-personnel"));

  const t = await getTranslations("auth");
  const result = verification && verification in VERIFICATION_TONES ? (verification as VerificationResult) : null;
  const tone = result ? VERIFICATION_TONES[result] : null;
  const safeNext = next ? safeRedirectPath(next, "") || undefined : undefined;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("login.intro")}</p>
      </div>

      {result ? (
        <div
          role={tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {t(`verification.${result}`)}
        </div>
      ) : null}

      {erreur === "loginToSubscribe" || erreur === "loginToBuyTicket" ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
          {t(erreur === "loginToBuyTicket" ? "login.loginToBuyTicket" : "login.loginToSubscribe")}
        </div>
      ) : null}

      <Card>
        <LoginForm next={safeNext} />
        <p className="mt-4 text-center text-sm text-zinc-600">
          {t("login.noAccount")}{" "}
          <Link href="/inscription" className="font-semibold text-gold-dark hover:underline">
            {t("login.createAccount")}
          </Link>
        </p>
      </Card>

      {tone === "error" ? <ResendVerificationForm /> : null}

      {process.env.NODE_ENV !== "production" ? (
        <Card className="border-amber-200">
          <p className="text-xs font-bold tracking-wider text-gold-dark uppercase">{t("login.demoTitle")}</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            <li>
              {t("login.demoClient")} <code className="text-gold-dark">client@wantedtun.tn</code> / <code>Client2026!</code>
            </li>
            <li>
              {t("login.demoAdmin")} <code className="text-gold-dark">admin@wantedtun.tn</code> / <code>Admin2026!</code>
            </li>
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
