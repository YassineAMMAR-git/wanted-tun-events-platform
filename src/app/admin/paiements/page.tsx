import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { activities, paymentLinks, plans, subscriptions, users } from "@/db/schema";
import { listMethods } from "@/lib/mollie/client";
import { appUrl, mollieConfigured, mollieMode, mollieWebhookUrl, webhookReachable } from "@/lib/mollie/config";
import { formatDateTime, formatPrice } from "@/lib/format";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; label: string; detail?: string };

async function loadRecent() {
  try {
    return await db
      .select({
        link: paymentLinks,
        subscription: subscriptions,
        user: users,
        planName: plans.name,
        activityName: activities.name,
      })
      .from(paymentLinks)
      .innerJoin(subscriptions, eq(subscriptions.id, paymentLinks.subscriptionId))
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .orderBy(desc(paymentLinks.createdAt))
      .limit(25);
  } catch {
    // Table payment_links absente : schéma pas encore appliqué sur cette base.
    return null;
  }
}

const LINK_STATUS_STYLE: Record<string, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  open: "border-amber-200 bg-amber-50 text-gold-dark",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  expired: "border-zinc-200 bg-zinc-100 text-zinc-600",
  canceled: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const [locale, t] = await Promise.all([getLocale(), getTranslations("admin.payments")]);
  const configured = mollieConfigured();
  const mode = mollieMode();

  // La liste des moyens de paiement sert de test de la clé d'API.
  let methods: string[] | null = null;
  let apiError: string | null = null;
  if (configured) {
    try {
      methods = (await listMethods()).map((method) => method.description);
    } catch (error) {
      apiError = error instanceof Error ? error.message : String(error);
    }
  }
  const recent = await loadRecent();
  const reachable = webhookReachable();

  const checks: Check[] = [
    {
      ok: configured,
      label: t("checkKey"),
      detail: configured ? t(mode === "live" ? "modeLive" : "modeTest") : t("checkKeyHint"),
    },
    {
      ok: methods !== null && methods.length > 0,
      label: t("checkApi"),
      detail: apiError
        ? t("checkApiError", { error: apiError })
        : methods
          ? methods.length > 0
            ? t("methods", { list: methods.join(", ") })
            : t("noMethods")
          : t("checkApiHint"),
    },
    { ok: reachable, label: t("checkWebhook"), detail: reachable ? t("checkWebhookOk") : t("checkWebhookHint", { url: appUrl() }) },
    { ok: recent !== null, label: t("checkTables"), detail: recent === null ? t("checkTablesHint") : undefined },
  ];
  const ready = checks.every((check) => check.ok);

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />
      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          ready
            ? mode === "live"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-sky-200 bg-sky-50 text-sky-700"
            : "border-amber-200 bg-amber-50 text-gold-dark"
        }`}
      >
        {ready ? (mode === "live" ? `✅ ${t("readyLive")}` : `🧪 ${t("readyTest")}`) : `ℹ️ ${t("readyOff")}`}
      </div>

      <Card>
        <h2 className="text-base font-bold text-zinc-900">{t("checklistTitle")}</h2>
        <ul className="mt-3 divide-y divide-zinc-200">
          {checks.map((check) => (
            <li key={check.label} className="flex gap-3 py-2.5">
              <span aria-hidden="true">{check.ok ? "✅" : "⬜"}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{check.label}</p>
                {check.detail ? <p className="text-xs break-words text-zinc-600">{check.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          <p className="font-semibold text-zinc-700">{t("webhookUrl")}</p>
          <code dir="ltr" className="break-all">
            {mollieWebhookUrl()}
          </code>
          <p className="mt-1">{t("webhookNote")}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="https://my.mollie.com/dashboard" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            {t("openDashboard")}
          </a>
        </div>
      </Card>

      <section>
        <SectionTitle title={t("recentTitle")} subtitle={t("recentSubtitle")} />
        {!recent || recent.length === 0 ? (
          <EmptyState title={t("recentEmpty")} />
        ) : (
          <div className="card scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("colDate")}</th>
                  <th>{t("colClient")}</th>
                  <th>{t("colPlan")}</th>
                  <th>{t("colAmount")}</th>
                  <th>{t("colLink")}</th>
                  <th>{t("colSubscription")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(({ link, subscription, user, planName, activityName }) => (
                  <tr key={link.id}>
                    <td className="whitespace-nowrap">{formatDateTime(link.createdAt, locale)}</td>
                    <td>
                      {user.firstName} {user.lastName}
                      <span className="block text-xs text-zinc-500" dir="ltr">
                        {user.email}
                      </span>
                    </td>
                    <td>{planName ?? t("ticketOf", { name: activityName })}</td>
                    <td className="whitespace-nowrap">{formatPrice(link.amountCents, locale)}</td>
                    <td>
                      <span className={`badge ${LINK_STATUS_STYLE[link.status] ?? LINK_STATUS_STYLE.expired}`}>
                        {t(`linkStatus.${link.status in LINK_STATUS_STYLE ? link.status : "expired"}` as "linkStatus.paid")}
                      </span>
                      <span className="block text-[11px] text-zinc-500" dir="ltr">
                        {link.externalId}
                      </span>
                    </td>
                    <td className="text-xs text-zinc-600">
                      #{subscription.id} · {subscription.paymentStatus === "paid" ? t("subPaid") : t("subPending")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
