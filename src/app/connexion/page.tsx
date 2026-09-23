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
        <h1 className="mt-2 text-3xl font-black text-white">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("login.intro")}</p>
      </div>

      {result ? (
        <div
          role={tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            tone === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {t(`verification.${result}`)}
        </div>
      ) : null}

      {erreur === "loginToSubscribe" ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t("login.loginToSubscribe")}
        </div>
      ) : null}

      <Card>
        <LoginForm next={safeNext} />
        <p className="mt-4 text-center text-sm text-zinc-400">
          {t("login.noAccount")}{" "}
          <Link href="/inscription" className="font-semibold text-amber-300 hover:underline">
            {t("login.createAccount")}
          </Link>
        </p>
      </Card>

      {tone === "error" ? <ResendVerificationForm /> : null}

      {process.env.NODE_ENV !== "production" ? (
        <Card className="border-amber-300/20">
          <p className="text-xs font-bold tracking-wider text-amber-300 uppercase">{t("login.demoTitle")}</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            <li>
              {t("login.demoClient")} <code className="text-amber-200">client@wantedtun.tn</code> / <code>Client2026!</code>
            </li>
            <li>
              {t("login.demoAdmin")} <code className="text-amber-200">admin@wantedtun.tn</code> / <code>Admin2026!</code>
            </li>
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
