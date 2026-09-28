import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { paymentLinks, plans, subscriptions, users, type QontoConnection } from "@/db/schema";
import { disconnectQontoAction, registerQontoWebhookAction } from "@/app/actions/admin";
import { getConnection, getPaymentLinksConnection, type ConnectionStatus } from "@/lib/qonto/client";
import { qontoConfigured, qontoEnv, qontoRedirectUri, qontoWebhookUrl } from "@/lib/qonto/config";
import { formatDateTime, formatPrice } from "@/lib/format";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; label: string; detail?: string };

async function loadState() {
  let connection: QontoConnection | null = null;
  let tablesReady = true;
  try {
    connection = await getConnection();
  } catch {
    tablesReady = false;
  }

  let linksStatus: ConnectionStatus | null = null;
  let linksLocation: string | undefined;
  let apiError: string | null = null;
  if (connection) {
    try {
      const result = await getPaymentLinksConnection();
      linksStatus = result.status;
      linksLocation = result.connection_location;
    } catch (error) {
      apiError = error instanceof Error ? error.message : String(error);
    }
  }

  const recent = tablesReady
    ? await db
        .select({ link: paymentLinks, subscription: subscriptions, user: users, planName: plans.name })
        .from(paymentLinks)
        .innerJoin(subscriptions, eq(subscriptions.id, paymentLinks.subscriptionId))
        .innerJoin(users, eq(users.id, subscriptions.userId))
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .orderBy(desc(paymentLinks.createdAt))
        .limit(25)
    : [];

  return { connection, tablesReady, linksStatus, linksLocation, apiError, recent };
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
  const configured = qontoConfigured();
  const state = configured ? await loadState() : null;
  const connection = state?.connection ?? null;

  const checks: Check[] = [
    { ok: configured, label: t("checkConfigured"), detail: configured ? t("mode", { mode: qontoEnv() }) : t("checkConfiguredHint") },
    {
      ok: Boolean(state?.tablesReady),
      label: t("checkTables"),
      detail: state && !state.tablesReady ? t("checkTablesHint") : undefined,
    },
    {
      ok: Boolean(connection && !connection.lastError),
      label: t("checkConnected"),
      detail: connection
        ? connection.lastError
          ? t("checkConnectedError", { error: connection.lastError })
          : t("checkConnectedSince", {
              date: formatDateTime(connection.connectedAt, locale),
              until: formatDateTime(connection.refreshTokenExpiresAt, locale),
            })
        : t("checkConnectedHint"),
    },
    {
      ok: state?.linksStatus === "enabled",
      label: t("checkLinks"),
      detail: state?.apiError
        ? t("checkApiError", { error: state.apiError })
        : state?.linksStatus
          ? t("linksStatus", { status: state.linksStatus })
          : t("checkLinksHint"),
    },
    { ok: Boolean(connection?.webhookSubscriptionId), label: t("checkWebhook"), detail: t("checkWebhookHint") },
  ];
  const ready = checks.every((check) => check.ok);

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />
      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-gold-dark"
        }`}
      >
        {ready ? `✅ ${t("readyOn")}` : `ℹ️ ${t("readyOff")}`}
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

        <div className="mt-4 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-zinc-700">{t("redirectUri")}</p>
            <code dir="ltr" className="break-all">
              {qontoRedirectUri()}
            </code>
          </div>
          <div>
            <p className="font-semibold text-zinc-700">{t("webhookUrl")}</p>
            <code dir="ltr" className="break-all">
              {qontoWebhookUrl()}
            </code>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {configured && state?.tablesReady ? (
            // Lien classique (pas de préchargement) : la route redirige vers Qonto.
            <a href="/api/qonto/connect" className="btn btn-primary">
              {connection ? t("reconnect") : t("connect")}
            </a>
          ) : null}
          {state?.linksLocation && state.linksStatus !== "enabled" ? (
            <a href={state.linksLocation} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              {t("activateLinks")}
            </a>
          ) : null}
          {connection ? (
            <>
              <form action={registerQontoWebhookAction}>
                <button className="btn btn-ghost" type="submit">
                  {t("registerWebhook")}
                </button>
              </form>
              <form action={disconnectQontoAction}>
                <button className="btn btn-danger" type="submit">
                  {t("disconnect")}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </Card>

      <section>
        <SectionTitle title={t("recentTitle")} subtitle={t("recentSubtitle")} />
        {!state || state.recent.length === 0 ? (
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
                {state.recent.map(({ link, subscription, user, planName }) => (
                  <tr key={link.id}>
                    <td className="whitespace-nowrap">{formatDateTime(link.createdAt, locale)}</td>
                    <td>
                      {user.firstName} {user.lastName}
                      <span className="block text-xs text-zinc-500" dir="ltr">
                        {user.email}
                      </span>
                    </td>
                    <td>{planName}</td>
                    <td className="whitespace-nowrap">{formatPrice(link.amountCents, locale)}</td>
                    <td>
                      <span className={`badge ${LINK_STATUS_STYLE[link.status] ?? LINK_STATUS_STYLE.expired}`}>
                        {t(`linkStatus.${link.status in LINK_STATUS_STYLE ? link.status : "expired"}` as "linkStatus.paid")}
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
