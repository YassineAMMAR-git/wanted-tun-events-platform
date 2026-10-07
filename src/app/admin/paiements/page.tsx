import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { activities, paymentLinks, plans, subscriptions, users } from "@/db/schema";
import { listMethods } from "@/lib/mollie/client";
import { mollieConfigured, mollieMode } from "@/lib/mollie/config";
import { formatDateTime, formatPrice } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

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
      .limit(100);
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

  // Rien n'est affiché quand tout va bien : seul un problème de paiement en ligne est signalé.
  let problem: string | null = null;
  if (!configured) {
    problem = t("readyOff");
  } else {
    try {
      if ((await listMethods()).length === 0) problem = t("noMethods");
    } catch (error) {
      problem = t("checkApiError", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  const recent = await loadRecent();
  if (recent === null) problem = t("checkTablesHint");

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />

      {problem ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
          ⚠️ {problem}
        </div>
      ) : mollieMode() === "test" ? (
        <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          🧪 {t("readyTest")}
        </div>
      ) : null}

      <section>
        <SectionTitle eyebrow={t("eyebrow")} title={t("recentTitle")} subtitle={t("recentSubtitle")} />
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
