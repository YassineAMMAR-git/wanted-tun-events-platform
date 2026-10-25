import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, activities, paymentLinks, plans, subscriptions, users } from "@/db/schema";
import { listMethods } from "@/lib/mollie/client";
import { mollieConfigured, mollieMode } from "@/lib/mollie/config";
import { formatDateTime, formatPrice } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Pagination, readPage } from "@/components/pagination";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { localize } from "@/lib/i18n/content";

export const dynamic = "force-dynamic";

/** Nombre de paiements affichés par page. */
const PAGE_SIZE = 10;

/** Filtre « statut » de l'URL → statuts du paiement Mollie regroupés. */
const STATUS_FILTERS = {
  paye: ["paid"],
  attente: ["open", "processing"],
  expire: ["expired", "canceled"],
} as const;
type StatusFilter = keyof typeof STATUS_FILTERS;
const isStatusFilter = (value: string | undefined): value is StatusFilter => !!value && value in STATUS_FILTERS;

type PaymentFilters = { activityId: number | null; search: string; status: StatusFilter | null };

/** Une page de paiements filtrés, du plus récent au plus ancien, et leur nombre total. */
async function loadPayments(rawPage: string | undefined, filters: PaymentFilters) {
  const conditions: SQL[] = [];
  if (filters.activityId) conditions.push(eq(subscriptions.activityId, filters.activityId));
  if (filters.status) conditions.push(inArray(paymentLinks.status, [...STATUS_FILTERS[filters.status]]));
  if (filters.search) {
    const like = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(users.email, like),
        ilike(users.firstName, like),
        ilike(users.lastName, like),
        sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ilike ${like}`,
      )!,
    );
  }
  const filter = conditions.length > 0 ? and(...conditions) : undefined;
  try {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(paymentLinks)
      .innerJoin(subscriptions, eq(subscriptions.id, paymentLinks.subscriptionId))
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(filter);
    const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    const page = readPage(rawPage, pageCount);
    const rows = await db
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
      .where(filter)
      .orderBy(desc(paymentLinks.createdAt), desc(paymentLinks.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return { rows, total, page, pageCount };
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
  searchParams: Promise<{ ok?: string; erreur?: string; page?: string; activite?: string; q?: string; statut?: string }>;
}) {
  const { ok, erreur, page: rawPage, activite, q, statut } = await searchParams;
  const [locale, t, tCommon, activityList] = await Promise.all([
    getLocale(),
    getTranslations("admin.payments"),
    getTranslations("common"),
    db.select().from(activities).orderBy(asc(activities.name)),
  ]);
  // Filtre du tableau : une activité connue, sinon toutes.
  const shownActivity = activityList.find((activity) => String(activity.id) === activite);
  const search = q?.trim().slice(0, 100) ?? "";
  const status = isStatusFilter(statut) ? statut : null;
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
  const payments = await loadPayments(rawPage, { activityId: shownActivity?.id ?? null, search, status });
  if (payments === null) problem = t("checkTablesHint");
  const recent = payments?.rows ?? null;

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

      <section id="paiements" className="scroll-mt-20">
        <SectionTitle eyebrow={t("eyebrow")} title={t("recentTitle")} subtitle={t("recentSubtitle")} />
        {/* Formulaire GET : les critères restent dans l'URL et le tableau repart de la première page. */}
        <FilterBar
          action="/admin/paiements#paiements"
          active={Boolean(search || shownActivity || status)}
          submitLabel={t("filterApply")}
          resetLabel={tCommon("reset")}
        >
          <FilterText name="q" label={tCommon("search")} defaultValue={search} placeholder={t("searchPlaceholder")} />
          <FilterSelect
            name="activite"
            label={t("filterActivity")}
            defaultValue={shownActivity ? String(shownActivity.id) : ""}
            placeholder={t("allActivities")}
            options={activityList.map((activity) => ({
              value: String(activity.id),
              label: localize(activity, locale, ACTIVITY_TRANSLATABLE).name ?? "",
            }))}
          />
          <FilterSelect
            name="statut"
            label={t("filterStatus")}
            defaultValue={status ?? ""}
            placeholder={t("allStatuses")}
            options={(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((value) => ({
              value,
              label: t(`statusFilter.${value}`),
            }))}
          />
        </FilterBar>
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
                    <td>
                      {subscription.kind === "membership" && planName ? (
                        <>
                          <span className="font-semibold text-zinc-900">{planName}</span>
                          <span className="block text-xs text-zinc-500">
                            {activityName} · {t("packSessions", { count: subscription.sessionsIncluded })}
                          </span>
                        </>
                      ) : (
                        <>
                          {t("ticketOf", { name: activityName })}
                          {subscription.priceLabel ? (
                            <span className="block text-xs text-zinc-500">{subscription.priceLabel}</span>
                          ) : null}
                        </>
                      )}
                    </td>
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
        {payments ? (
          <Pagination
            page={payments.page}
            pageCount={payments.pageCount}
            basePath="/admin/paiements"
            params={{
              activite: shownActivity ? String(shownActivity.id) : undefined,
              q: search || undefined,
              statut: status ?? undefined,
            }}
            anchor="paiements"
            labels={{
              previous: t("pageNewer"),
              next: t("pageOlder"),
              status: t("pageStatus", { page: payments.page, count: payments.pageCount, total: payments.total }),
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
