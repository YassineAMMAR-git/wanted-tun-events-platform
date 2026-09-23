import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
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
} from "@/db/schema";
import { createPlanAction, deletePlanAction, togglePlanAction, updatePlanAction } from "@/app/actions/admin";
import { formatPrice } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { PlanFields } from "@/app/admin/_components/plan-fields";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const [locale, t, tCommon, tStatus, tPlan] = await Promise.all([
    getLocale(),
    getTranslations("admin.plans"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("admin.planForm"),
  ]);
  const [rows, activityList, sold] = await Promise.all([
    db
      .select({
        plan: plans,
        activity: activities,
        category: categories,
        sold: sql<number>`(select count(*) from subscriptions s where s.plan_id = ${plans.id})::int`,
      })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .orderBy(asc(categories.position), asc(activities.name), asc(plans.priceCents)),
    db
      .select({ activity: activities, category: categories })
      .from(activities)
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .orderBy(asc(categories.position), asc(activities.name)),
    db.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.status, "active")),
  ]);

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

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
                  <h3 className="text-base font-bold text-white">{localizedPlan.name}</h3>
                  <p className="text-xs text-zinc-500">
                    <Link href={`/admin/activites/${row.activity.id}`} className="hover:text-amber-300">
                      {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}
                    </Link>{" "}
                    · {localize(row.category, locale, CATEGORY_TRANSLATABLE).name} · {t("sold", { count: row.sold })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-amber-300">{formatPrice(row.plan.priceCents, locale)}</span>
                  <span
                    className={`badge ${
                      row.plan.isActive
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
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

      <section>
        <SectionTitle eyebrow={t("newEyebrow")} title={t("newTitle")} />
        <Card>
          <form action={createPlanAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="redirectTo" value="/admin/abonnements" />
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label">{tPlan("activity")}</label>
              <select name="activityId" required className="select">
                {activityList.map((option) => (
                  <option key={option.activity.id} value={option.activity.id}>
                    {localize(option.category, locale, CATEGORY_TRANSLATABLE).name} —{" "}
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
