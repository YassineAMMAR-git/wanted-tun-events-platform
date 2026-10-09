import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  CATEGORY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  activities,
  categories,
  plans,
  subscriptions,
  users,
} from "@/db/schema";
import {
  addPlanSubscriberAction,
  changeSubscriptionPlanAction,
  createPlanAction,
  deletePlanAction,
  removePlanSubscriberAction,
  togglePlanAction,
  updatePlanAction,
} from "@/app/actions/admin";
import { SUBSCRIPTION_STATUS, formatDate, formatPrice, toSubscriptionStatus } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { PlanFields } from "@/app/admin/_components/plan-fields";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES = ["pending", "declared", "paid", "cancelled"] as const;
const toPaymentStatus = (value: string) =>
  (PAYMENT_STATUSES as readonly string[]).includes(value) ? (value as (typeof PAYMENT_STATUSES)[number]) : "pending";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string; q?: string; activite?: string; etat?: string; tri?: string }>;
}) {
  const { ok, erreur, q, activite, etat, tri } = await searchParams;
  const [locale, t, tCommon, tStatus, tPlan] = await Promise.all([
    getLocale(),
    getTranslations("admin.plans"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("admin.planForm"),
  ]);
  const search = q?.trim().slice(0, 100);
  // Seules les offres des activités à séances sont gérées ici ; celles d'un événement unique sont listées à part.
  const conditions: SQL[] = [eq(activities.kind, "recurring")];
  if (search) conditions.push(or(ilike(plans.name, `%${search}%`), ilike(activities.name, `%${search}%`))!);
  if (activite) conditions.push(eq(plans.activityId, Number(activite)));
  if (etat === "active") conditions.push(eq(plans.isActive, true));
  if (etat === "inactive") conditions.push(eq(plans.isActive, false));

  const soldCount = sql<number>`(select count(*) from subscriptions s where s.plan_id = ${plans.id})::int`;
  const planOrder = {
    prix: [asc(plans.priceCents)],
    prixDesc: [desc(plans.priceCents)],
    vendus: [desc(soldCount)],
    nom: [asc(plans.name)],
  }[tri ?? ""] ?? [asc(categories.position), asc(activities.name), asc(plans.priceCents)];

  const filtered = Boolean(search || activite || etat || tri);

  const [rows, activityList, sold, legacy] = await Promise.all([
    db
      .select({
        plan: plans,
        activity: activities,
        category: categories,
        sold: soldCount,
      })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...planOrder),
    db
      .select({ activity: activities, category: categories })
      .from(activities)
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(eq(activities.kind, "recurring"))
      .orderBy(asc(activities.name)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(and(eq(subscriptions.status, "active"), eq(subscriptions.kind, "membership"))),
    db
      .select({ plan: plans, activity: activities, category: categories, sold: soldCount })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(or(ne(activities.kind, "recurring"), isNull(activities.kind)))
      .orderBy(asc(categories.position), asc(activities.name), asc(plans.priceCents)),
  ]);

  // Tableau des abonnés : clients de chaque formule affichée (hors abonnements annulés).
  const planIds = rows.map((row) => row.plan.id);
  const [subscribers, clients, allPlans] = await Promise.all([
    planIds.length === 0
      ? []
      : db
          .select({ subscription: subscriptions, user: users })
          .from(subscriptions)
          .innerJoin(users, eq(users.id, subscriptions.userId))
          .where(
            and(
              eq(subscriptions.kind, "membership"),
              inArray(subscriptions.planId, planIds),
              ne(subscriptions.status, "cancelled"),
            ),
          )
          .orderBy(asc(users.lastName), asc(users.firstName)),
    db.select().from(users).where(ne(users.role, "admin")).orderBy(asc(users.lastName)),
    // Toutes les formules, y compris celles masquées par les filtres : cibles possibles d'un changement.
    db
      .select({ plan: plans, activity: activities })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .where(eq(activities.kind, "recurring"))
      .orderBy(asc(activities.name), asc(plans.name)),
  ]);
  const subscribersByPlan = new Map<number, typeof subscribers>();
  for (const row of subscribers) {
    const list = subscribersByPlan.get(row.subscription.planId!) ?? [];
    list.push(row);
    subscribersByPlan.set(row.subscription.planId!, list);
  }

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <FilterBar action="/admin/abonnements" active={filtered} submitLabel={tCommon("search")} resetLabel={tCommon("reset")}>
        <FilterText name="q" label={tCommon("search")} defaultValue={search} placeholder={t("searchPlaceholder")} />
        <FilterSelect
          name="activite"
          label={t("filterActivity")}
          defaultValue={activite}
          placeholder={tCommon("all")}
          options={activityList.map((row) => ({
            value: String(row.activity.id),
            label: localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name ?? "",
          }))}
        />
        <FilterSelect
          name="etat"
          label={t("filterState")}
          defaultValue={etat}
          placeholder={tCommon("all")}
          options={[
            { value: "active", label: tStatus("plan.active") },
            { value: "inactive", label: tStatus("plan.inactive") },
          ]}
        />
        <FilterSelect
          name="tri"
          label={tCommon("sortBy")}
          defaultValue={tri}
          options={[
            { value: "", label: t("sortDefault") },
            { value: "prix", label: t("sortPriceAsc") },
            { value: "prixDesc", label: t("sortPriceDesc") },
            { value: "vendus", label: t("sortSold") },
            { value: "nom", label: t("sortName") },
          ]}
        />
      </FilterBar>

      <p className="text-sm text-zinc-600">{t("resultCount", { count: rows.length })}</p>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={t("statConfigured")}
          value={rows.length}
          hint={t("statConfiguredHint", { count: rows.filter((r) => r.plan.isActive).length })}
        />
        <Stat label={t("statWithLink")} value={rows.filter((r) => r.plan.paymentUrl).length} />
        <Stat label={t("statActiveSubs")} value={sold[0]?.count ?? 0} />
      </section>

      <div className="space-y-4">
        {rows.map((row) => {
          const localizedPlan = localize(row.plan, locale, PLAN_TRANSLATABLE);
          return (
            <Card key={row.plan.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-zinc-900">{localizedPlan.name}</h3>
                  <p className="text-xs text-zinc-500">
                    <Link href={`/admin/activites/${row.activity.id}`} className="hover:text-gold-dark">
                      {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}
                    </Link>{" "}
                    · {localize(row.category, locale, CATEGORY_TRANSLATABLE).name} · {t("sold", { count: row.sold })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-gold-dark">{formatPrice(row.plan.priceCents, locale)}</span>
                  <span
                    className={`badge ${
                      row.plan.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {tStatus(row.plan.isActive ? "plan.active" : "plan.inactive")}
                  </span>
                  <form action={togglePlanAction}>
                    <input type="hidden" name="id" value={row.plan.id} />
                    <input type="hidden" name="isActive" value={row.plan.isActive ? "false" : "true"} />
                    <button className="btn btn-ghost btn-sm" type="submit">
                      {row.plan.isActive ? t("deactivate") : t("activate")}
                    </button>
                  </form>
                  <form action={deletePlanAction}>
                    <input type="hidden" name="id" value={row.plan.id} />
                    <button className="btn btn-danger btn-sm" type="submit">
                      {tCommon("delete")}
                    </button>
                  </form>
                </div>
              </div>

              <form action={updatePlanAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="id" value={row.plan.id} />
                <input type="hidden" name="redirectTo" value="/admin/abonnements" />
                <PlanFields plan={row.plan} />
                <div className="sm:col-span-2 lg:col-span-4">
                  <button className="btn btn-primary btn-sm" type="submit">
                    {tCommon("save")}
                  </button>
                </div>
              </form>
            </Card>
          );
        })}
      </div>

      <section id="abonnes" className="scroll-mt-20">
        <SectionTitle eyebrow={t("subscribersEyebrow")} title={t("subscribersTitle")} subtitle={t("subscribersSubtitle")} />
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("colClient")}</th>
                <th>{t("colValidity")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colPayment")}</th>
                <th>{t("colChange")}</th>
                <th>{t("colActions")}</th>
              </tr>
            </thead>
            {rows.map((row) => {
              const members = subscribersByPlan.get(row.plan.id) ?? [];
              // Un abonné « en cours » (en attente ou actif) ne peut pas être inscrit une seconde fois à la formule.
              const enrolled = new Set(
                members.filter((m) => m.subscription.status !== "expired").map((m) => m.user.id),
              );
              // Changement possible uniquement vers la formule d'une autre activité, au même prix.
              const alternatives = allPlans.filter(
                (other) => other.plan.activityId !== row.plan.activityId && other.plan.priceCents === row.plan.priceCents,
              );
              return (
                <tbody key={row.plan.id}>
                  <tr className="bg-zinc-50">
                    <td colSpan={6}>
                      <span className="font-bold text-zinc-900">{localize(row.plan, locale, PLAN_TRANSLATABLE).name}</span>
                      <span className="text-zinc-600">
                        {" "}
                        · {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name} ·{" "}
                        {formatPrice(row.plan.priceCents, locale)} · {t("subscriberCount", { count: members.length })}
                      </span>
                    </td>
                  </tr>
                  {members.map(({ subscription, user }) => {
                    const status = toSubscriptionStatus(subscription.status);
                    return (
                      <tr key={subscription.id}>
                        <td>
                          <Link href={`/admin/clients/${user.id}`} className="font-semibold text-zinc-900 hover:text-gold-dark">
                            {user.firstName} {user.lastName}
                          </Link>
                          <span className="block text-xs text-zinc-500" dir="ltr">
                            {user.email}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-zinc-600">
                          {tCommon("dateRange", {
                            start: formatDate(subscription.startsAt, locale),
                            end: formatDate(subscription.endsAt, locale),
                          })}
                        </td>
                        <td>
                          <span className={`badge ${SUBSCRIPTION_STATUS[status]}`}>{tStatus(`subscription.${status}`)}</span>
                        </td>
                        <td className="text-zinc-600">
                          {tStatus(`payment.${toPaymentStatus(subscription.paymentStatus)}`)}
                        </td>
                        <td>
                          {alternatives.length > 0 ? (
                            <form action={changeSubscriptionPlanAction} className="flex items-center gap-2">
                              <input type="hidden" name="id" value={subscription.id} />
                              <select name="planId" required defaultValue="" className="select" aria-label={t("colChange")}>
                                <option value="" disabled>
                                  {t("changeChoose")}
                                </option>
                                {alternatives.map((other) => (
                                  <option key={other.plan.id} value={other.plan.id}>
                                    {localize(other.activity, locale, ACTIVITY_TRANSLATABLE).name} —{" "}
                                    {localize(other.plan, locale, PLAN_TRANSLATABLE).name}
                                  </option>
                                ))}
                              </select>
                              <button className="btn btn-ghost btn-sm" type="submit">
                                {t("change")}
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-zinc-500">{t("noAlternative")}</span>
                          )}
                        </td>
                        <td>
                          <form action={removePlanSubscriberAction}>
                            <input type="hidden" name="id" value={subscription.id} />
                            <button className="btn btn-danger btn-sm" type="submit">
                              {t("removeSubscriber")}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={6}>
                      <form action={addPlanSubscriberAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="hidden" name="planId" value={row.plan.id} />
                        <select name="userId" required defaultValue="" className="select sm:max-w-md" aria-label={t("addSubscriber")}>
                          <option value="" disabled>
                            {t("addSubscriber")}
                          </option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id} disabled={enrolled.has(client.id)}>
                              {client.firstName} {client.lastName} — {client.email}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-primary btn-sm" type="submit">
                          {tCommon("add")}
                        </button>
                      </form>
                    </td>
                  </tr>
                </tbody>
              );
            })}
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} className="text-center text-zinc-500">
                    {t("noPlans")}
                  </td>
                </tr>
              </tbody>
            ) : null}
          </table>
        </div>
      </section>

      {legacy.length > 0 ? (
        <section id="anciennes-offres">
          <SectionTitle eyebrow={t("legacyEyebrow")} title={t("legacyTitle")} subtitle={t("legacySubtitle")} />
          <Card className="border-amber-200">
            <ul className="divide-y divide-zinc-200">
              {legacy.map((row) => (
                <li key={row.plan.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {localize(row.plan, locale, PLAN_TRANSLATABLE).name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {row.category.emoji} {localize(row.category, locale, CATEGORY_TRANSLATABLE).name} ·{" "}
                      {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name} · {t("sold", { count: row.sold })}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      row.plan.isActive
                        ? "border-amber-200 bg-amber-50 text-gold-dark"
                        : "border-zinc-200 bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {row.plan.isActive ? t("legacyHidden") : tStatus("plan.inactive")}
                  </span>
                  {row.plan.isActive ? (
                    <form action={togglePlanAction}>
                      <input type="hidden" name="id" value={row.plan.id} />
                      <input type="hidden" name="isActive" value="false" />
                      <button className="btn btn-ghost btn-sm" type="submit">
                        {t("deactivate")}
                      </button>
                    </form>
                  ) : null}
                  <form action={deletePlanAction}>
                    <input type="hidden" name="id" value={row.plan.id} />
                    <button className="btn btn-danger btn-sm" type="submit">
                      {tCommon("delete")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle eyebrow={t("newEyebrow")} title={t("newTitle")} />
        <Card>
          {activityList.length === 0 ? <p className="mb-3 text-sm text-rose-700">⚠️ {t("noRecurringActivity")}</p> : null}
          <form action={createPlanAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="redirectTo" value="/admin/abonnements" />
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label">{tPlan("activity")}</label>
              <select name="activityId" required className="select">
                {activityList.map((option) => (
                  <option key={option.activity.id} value={option.activity.id}>
                    {localize(option.activity, locale, ACTIVITY_TRANSLATABLE).name}
                  </option>
                ))}
              </select>
            </div>
            <PlanFields />
            <div className="sm:col-span-2 lg:col-span-4">
              <button className="btn btn-primary" type="submit">
                {tPlan("create")}
              </button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
