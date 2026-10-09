import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
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
  setSubscriptionStatusAction,
  togglePlanAction,
  updatePlanAction,
} from "@/app/actions/admin";
import { SUBSCRIPTION_STATUS, formatPrice, toSubscriptionStatus } from "@/lib/format";
import { loadPromotions, promoPlanOptions } from "@/lib/promotions";
import { PACK_SESSIONS_USED } from "@/lib/subscriptions";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { PlanFields } from "@/app/admin/_components/plan-fields";
import { AutoSubmitSelect } from "@/app/admin/_components/auto-submit-select";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    erreur?: string;
    q?: string;
    activite?: string;
    etat?: string;
    tri?: string;
    inscritsActivite?: string;
    inscritsFormule?: string;
  }>;
}) {
  const { ok, erreur, q, activite, etat, tri, inscritsActivite, inscritsFormule } = await searchParams;
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

  // Tableau des inscrits : une seule activité à la fois (la première par défaut), toutes ses formules ou une seule.
  // Est inscrit le client qui a payé : une commande en attente de paiement n'y figure pas.
  const allPlans = await db
    .select({ plan: plans, activity: activities })
    .from(plans)
    .innerJoin(activities, eq(activities.id, plans.activityId))
    .where(eq(activities.kind, "recurring"))
    .orderBy(asc(activities.name), asc(plans.priceCents), asc(plans.name));
  const shownActivity = (activityList.find((row) => String(row.activity.id) === inscritsActivite) ?? activityList[0])?.activity;
  const activityPlans = allPlans.filter((row) => row.plan.activityId === shownActivity?.id).map((row) => row.plan);
  // Une formule d'une autre activité (activité changée entre-temps) est ignorée.
  const shownPlan = activityPlans.find((plan) => String(plan.id) === inscritsFormule);
  const [subscribers, clients, promoPlans, promotions] = await Promise.all([
    shownActivity
      ? db
          .select({ subscription: subscriptions, user: users, plan: plans, used: PACK_SESSIONS_USED })
          .from(subscriptions)
          .innerJoin(users, eq(users.id, subscriptions.userId))
          .innerJoin(plans, eq(plans.id, subscriptions.planId))
          .where(
            and(
              eq(subscriptions.kind, "membership"),
              eq(subscriptions.activityId, shownActivity.id),
              shownPlan ? eq(subscriptions.planId, shownPlan.id) : undefined,
              eq(subscriptions.paymentStatus, "paid"),
              ne(subscriptions.status, "cancelled"),
            ),
          )
          .orderBy(asc(users.lastName), asc(users.firstName))
      : [],
    db.select().from(users).where(ne(users.role, "admin")).orderBy(asc(users.lastName)),
    promoPlanOptions(locale),
    loadPromotions(),
  ]);

  // Les actions du tableau des inscrits reviennent sur l'activité et la formule affichées.
  const subscribersQuery = new URLSearchParams();
  if (shownActivity) subscribersQuery.set("inscritsActivite", String(shownActivity.id));
  if (shownPlan) subscribersQuery.set("inscritsFormule", String(shownPlan.id));
  const subscribersPath = subscribersQuery.size > 0 ? `/admin/abonnements?${subscribersQuery}` : "/admin/abonnements";
  const subscriberContext = (
    <>
      {shownActivity ? <input type="hidden" name="inscritsActivite" value={shownActivity.id} /> : null}
      {shownPlan ? <input type="hidden" name="inscritsFormule" value={shownPlan.id} /> : null}
    </>
  );

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />

      <section id="abonnes" className="scroll-mt-20">
        <SectionTitle eyebrow={t("subscribersEyebrow")} title={t("subscribersTitle")} subtitle={t("subscribersSubtitle")} />
        {shownActivity ? (
          <>
            <Card>
              {/* Formulaire GET appliqué dès qu'on change d'activité ou de formule ; les filtres des offres sont conservés. */}
              <form action="/admin/abonnements#abonnes" className="grid items-end gap-3 sm:grid-cols-2">
                {search ? <input type="hidden" name="q" value={search} /> : null}
                {activite ? <input type="hidden" name="activite" value={activite} /> : null}
                {etat ? <input type="hidden" name="etat" value={etat} /> : null}
                {tri ? <input type="hidden" name="tri" value={tri} /> : null}
                <AutoSubmitSelect
                  name="inscritsActivite"
                  label={t("filterActivity")}
                  value={String(shownActivity.id)}
                  options={activityList.map((row) => ({
                    value: String(row.activity.id),
                    label: localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name ?? "",
                  }))}
                />
                <AutoSubmitSelect
                  name="inscritsFormule"
                  label={t("filterPlan")}
                  value={shownPlan ? String(shownPlan.id) : ""}
                  placeholder={t("allPlans")}
                  options={activityPlans.map((plan) => ({
                    value: String(plan.id),
                    label: `${localize(plan, locale, PLAN_TRANSLATABLE).name} — ${formatPrice(plan.priceCents, locale)}`,
                  }))}
                />
                <noscript className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    {tCommon("filter")}
                  </button>
                </noscript>
              </form>
            </Card>

            <p className="mt-4 text-sm text-zinc-600">{t("subscriberCount", { count: subscribers.length })}</p>

            <div className="card scroll-x mt-3">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("colClient")}</th>
                    <th>{t("colPlan")}</th>
                    <th>{t("colRemaining")}</th>
                    <th>{t("colStatus")}</th>
                    <th>{t("colChange")}</th>
                    <th>{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map(({ subscription, user, plan, used }) => {
                    const status = toSubscriptionStatus(subscription.status);
                    // Changement possible uniquement vers la formule d'une autre activité, au même prix.
                    const alternatives = allPlans.filter(
                      (other) => other.plan.activityId !== plan.activityId && other.plan.priceCents === plan.priceCents,
                    );
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
                        <td className="text-zinc-800">
                          {localize(plan, locale, PLAN_TRANSLATABLE).name}
                          <span className="block text-xs text-zinc-500">{formatPrice(plan.priceCents, locale)}</span>
                        </td>
                        <td className="whitespace-nowrap text-zinc-700" dir="ltr">
                          {Math.max(subscription.sessionsIncluded - used, 0)} / {subscription.sessionsIncluded}
                        </td>
                        <td>
                          <span className={`badge ${SUBSCRIPTION_STATUS[status]}`}>{tStatus(`subscription.${status}`)}</span>
                        </td>
                        <td>
                          {alternatives.length > 0 ? (
                            <form action={changeSubscriptionPlanAction} className="flex items-center gap-2">
                              <input type="hidden" name="id" value={subscription.id} />
                              {subscriberContext}
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
                          <div className="flex flex-wrap gap-2">
                            {/* Absence excusée : une séance est rendue au client, son pack s'agrandit d'une séance. */}
                            <form action={setSubscriptionStatusAction}>
                              <input type="hidden" name="id" value={subscription.id} />
                              <input type="hidden" name="action" value="extend" />
                              <input type="hidden" name="redirectTo" value={subscribersPath} />
                              <button className="btn btn-ghost btn-sm whitespace-nowrap" type="submit" title={t("addSessionHint")}>
                                {t("addSession")}
                              </button>
                            </form>
                            <form action={removePlanSubscriberAction}>
                              <input type="hidden" name="id" value={subscription.id} />
                              {subscriberContext}
                              <button className="btn btn-danger btn-sm" type="submit">
                                {t("removeSubscriber")}
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {subscribers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-zinc-500">
                        {t("noSubscribers")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {activityPlans.length > 0 ? (
              <Card className="mt-5">
                <h3 className="text-base font-bold text-zinc-900">
                  {t("addTitle", { activity: localize(shownActivity, locale, ACTIVITY_TRANSLATABLE).name ?? "" })}
                </h3>
                <form action={addPlanSubscriberAction} className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  {subscriberContext}
                  <div>
                    <label className="label" htmlFor="addUserId">
                      {t("colClient")}
                    </label>
                    <select id="addUserId" name="userId" required defaultValue="" className="select">
                      <option value="" disabled>
                        {t("addSubscriber")}
                      </option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.firstName} {client.lastName} — {client.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="addPlanId">
                      {t("filterPlan")}
                    </label>
                    <select
                      key={shownPlan?.id ?? activityPlans[0]!.id}
                      id="addPlanId"
                      name="planId"
                      required
                      defaultValue={shownPlan?.id ?? activityPlans[0]!.id}
                      className="select"
                    >
                      {activityPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {localize(plan, locale, PLAN_TRANSLATABLE).name} — {formatPrice(plan.priceCents, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit">
                    {tCommon("add")}
                  </button>
                </form>
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <p className="text-sm text-zinc-600">{t("noRecurringActivity")}</p>
          </Card>
        )}
      </section>

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <FilterBar action="/admin/abonnements" active={filtered} submitLabel={tCommon("search")} resetLabel={tCommon("reset")}>
        {/* L'activité et la formule choisies pour le tableau des inscrits sont conservées. */}
        {subscriberContext}
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
                <PlanFields
                  plan={row.plan}
                  promotion={promotions.get(row.plan.id)}
                  promoPlans={promoPlans}
                  activityId={row.plan.activityId}
                />
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
            <PlanFields promoPlans={promoPlans} />
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
