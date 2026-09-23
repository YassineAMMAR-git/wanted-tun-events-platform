import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { CATEGORY_TRANSLATABLE, activities, categories, plans, sessions } from "@/db/schema";
import {
  createPlanAction,
  createSessionAction,
  deleteActivityAction,
  deleteSessionAction,
  setSessionStatusAction,
  updateActivityAction,
  updatePlanAction,
  updateSessionAction,
} from "@/app/actions/admin";
import { centsToEurosInput, formatDateTime, formatPrice, isPast, toDateTimeLocalValue } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";
import { PlanFields } from "@/app/admin/_components/plan-fields";

export const dynamic = "force-dynamic";

export default async function AdminActivityDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const { ok, erreur } = await searchParams;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) notFound();

  const [locale, t, tCommon, tStatus, tPlan] = await Promise.all([
    getLocale(),
    getTranslations("admin.activityDetail"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("admin.planForm"),
  ]);

  const activity = (await db.select().from(activities).where(eq(activities.id, activityId)).limit(1))[0];
  if (!activity) notFound();

  const [categoryList, sessionList, planList] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select().from(sessions).where(eq(sessions.activityId, activityId)).orderBy(desc(sessions.startsAt)),
    db.select().from(plans).where(eq(plans.activityId, activityId)).orderBy(asc(plans.priceCents)),
  ]);

  const upcoming = sessionList.filter((s) => !isPast(s.startsAt) && s.status === "scheduled").length;
  const backTo = `/admin/activites/${activity.id}`;

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <nav className="text-sm text-zinc-500">
        <Link href="/admin/activites" className="hover:text-amber-300">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">{activity.name}</span>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("statSessions")} value={sessionList.length} hint={t("statSessionsHint", { count: upcoming })} />
        <Stat
          label={t("statPlans")}
          value={planList.length}
          hint={t("statPlansHint", { count: planList.filter((p) => p.isActive).length })}
        />
        <Stat label={t("statCapacity")} value={activity.capacity} />
        <Stat label={t("statPrice")} value={formatPrice(activity.priceCents, locale)} />
      </section>

      {/* ------------------------------ activité ------------------------------ */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t("editTitle")}</h2>
          <Link href={`/activites/${activity.slug}`} className="btn btn-ghost btn-sm">
            {t("publicPage")}
          </Link>
        </div>
        <form action={updateActivityAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={activity.id} />
          <div className="sm:col-span-2">
            <TranslationFields
              gridClassName="grid gap-4 sm:grid-cols-2"
              values={{
                name: activity.name,
                scheduleText: activity.scheduleText,
                shortDescription: activity.shortDescription,
                description: activity.description,
              }}
              translations={activity.translations}
              fields={[
                { name: "name", label: t("name"), required: true, maxLength: 180 },
                { name: "scheduleText", label: t("schedule"), maxLength: 200 },
                { name: "shortDescription", label: t("shortDescription"), maxLength: 280, className: "sm:col-span-2" },
                { name: "description", label: t("description"), multiline: true, maxLength: 5000, className: "sm:col-span-2" },
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">
              {t("category")}
            </label>
            <select id="categoryId" name="categoryId" defaultValue={activity.categoryId} className="select">
              {categoryList.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji} {localize(category, locale, CATEGORY_TRANSLATABLE).name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">
              {t("status")}
            </label>
            <select id="status" name="status" defaultValue={activity.status} className="select">
              <option value="active">{t("statusActive")}</option>
              <option value="hidden">{t("statusHidden")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="address">
              {t("address")}
            </label>
            <input id="address" name="address" maxLength={240} defaultValue={activity.address ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="city">
              {t("city")}
            </label>
            <input id="city" name="city" maxLength={120} defaultValue={activity.city ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="durationMinutes">
              {t("duration")}
            </label>
            <input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={15}
              defaultValue={activity.durationMinutes}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="price">
              {t("price")}
            </label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min={0}
              defaultValue={centsToEurosInput(activity.priceCents)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="capacity">
              {t("capacity")}
            </label>
            <input id="capacity" name="capacity" type="number" min={1} defaultValue={activity.capacity} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="imageUrl">
              {t("image")}
            </label>
            <input id="imageUrl" name="imageUrl" type="url" defaultValue={activity.imageUrl ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">
              {tCommon("save")}
            </button>
          </div>
        </form>
        <form action={deleteActivityAction} className="mt-3">
          <input type="hidden" name="id" value={activity.id} />
          <button className="btn btn-danger btn-sm" type="submit">
            {t("deleteActivity")}
          </button>
        </form>
      </Card>

      {/* ------------------------------- séances ------------------------------- */}
      <section>
        <SectionTitle eyebrow={t("sessionsEyebrow")} title={t("sessionsTitle")} subtitle={t("sessionsSubtitle")} />

        <Card className="mb-5">
          <form action={createSessionAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="activityId" value={activity.id} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TranslationFields
                gridClassName="grid gap-3 sm:grid-cols-2"
                fields={[
                  { name: "title", label: t("sessionTitle"), maxLength: 180, placeholder: t("sessionTitlePlaceholder") },
                  { name: "notes", label: t("notes"), maxLength: 2000 },
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="startsAt">
                {t("startsAt")}
              </label>
              <input id="startsAt" name="startsAt" type="datetime-local" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="duration">
                {t("duration")}
              </label>
              <input
                id="duration"
                name="durationMinutes"
                type="number"
                min={15}
                defaultValue={activity.durationMinutes}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="location">
                {t("location")}
              </label>
              <input id="location" name="location" maxLength={240} defaultValue={activity.address ?? ""} className="input" />
            </div>
            <div className="lg:col-span-3">
              <button className="btn btn-primary" type="submit">
                {t("addSession")}
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-3">
          {sessionList.map((session) => {
            const past = isPast(session.startsAt);
            return (
              <div key={session.id} className={`card p-4 ${past ? "opacity-70" : ""}`}>
                <p className="mb-3 text-xs text-zinc-500">
                  {past ? "⚪" : "🟢"} {formatDateTime(session.startsAt, locale)}
                </p>
                <form action={updateSessionAction} className="grid gap-3 lg:grid-cols-4">
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="activityId" value={activity.id} />
                  <div className="lg:col-span-4">
                    <TranslationFields
                      gridClassName="grid gap-3 sm:grid-cols-2"
                      values={{ title: session.title, notes: session.notes }}
                      translations={session.translations}
                      fields={[
                        { name: "title", label: t("title"), maxLength: 180 },
                        { name: "notes", label: t("notesPlaceholder"), maxLength: 2000 },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="label">{t("dateTime")}</label>
                    <input
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={toDateTimeLocalValue(session.startsAt)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">{t("durationShort")}</label>
                    <input name="durationMinutes" type="number" min={15} defaultValue={session.durationMinutes} className="input" />
                  </div>
                  <div>
                    <label className="label">{t("location")}</label>
                    <input name="location" maxLength={240} defaultValue={session.location ?? ""} className="input" />
                  </div>
                  <div>
                    <label className="label">{t("status")}</label>
                    <select name="status" defaultValue={session.status} className="select">
                      <option value="scheduled">{tStatus("session.scheduled")}</option>
                      <option value="cancelled">{tStatus("session.cancelled")}</option>
                      <option value="postponed">{tStatus("session.postponed")}</option>
                    </select>
                  </div>
                  <div className="lg:col-span-4">
                    <button className="btn btn-primary btn-sm" type="submit">
                      {tCommon("save")}
                    </button>
                  </div>
                </form>

                {/* Actions rapides : formulaires séparés (un formulaire ne peut pas en contenir un autre). */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href={`/admin/seances/${session.id}`} className="btn btn-ghost btn-sm">
                    {t("participants", { scope: past ? t("scopeHistory") : t("scopeUpcoming") })}
                  </Link>
                  {session.status === "scheduled" ? (
                    <>
                      <form action={setSessionStatusAction}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="status" value="postponed" />
                        <input type="hidden" name="redirectTo" value={backTo} />
                        <button className="btn btn-ghost btn-sm" type="submit">
                          {t("postpone")}
                        </button>
                      </form>
                      <form action={setSessionStatusAction}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <input type="hidden" name="redirectTo" value={backTo} />
                        <button className="btn btn-danger btn-sm" type="submit">
                          {t("cancelSession")}
                        </button>
                      </form>
                    </>
                  ) : (
                    <form action={setSessionStatusAction}>
                      <input type="hidden" name="id" value={session.id} />
                      <input type="hidden" name="status" value="scheduled" />
                      <input type="hidden" name="redirectTo" value={backTo} />
                      <button className="btn btn-ghost btn-sm" type="submit">
                        {t("reschedule")}
                      </button>
                    </form>
                  )}
                  <form action={deleteSessionAction}>
                    <input type="hidden" name="id" value={session.id} />
                    <input type="hidden" name="activityId" value={activity.id} />
                    <button className="btn btn-danger btn-sm" type="submit">
                      {tCommon("delete")}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {sessionList.length === 0 ? <p className="text-sm text-zinc-500">{t("noSessions")}</p> : null}
        </div>
      </section>

      {/* -------------------------------- offres -------------------------------- */}
      <section>
        <SectionTitle eyebrow={t("plansEyebrow")} title={t("plansTitle")} subtitle={t("plansSubtitle")} />
        <div className="space-y-4">
          {planList.map((plan) => (
            <Card key={plan.id}>
              <form action={updatePlanAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="redirectTo" value={backTo} />
                <PlanFields plan={plan} />
                <div className="sm:col-span-2 lg:col-span-4">
                  <button className="btn btn-primary btn-sm" type="submit">
                    {tPlan("save")}
                  </button>
                </div>
              </form>
            </Card>
          ))}
          {planList.length === 0 ? <p className="text-sm text-zinc-500">{t("noPlans")}</p> : null}
        </div>

        <Card className="mt-5">
          <h3 className="text-base font-bold text-white">{t("addPlan")}</h3>
          <form action={createPlanAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="activityId" value={activity.id} />
            <input type="hidden" name="redirectTo" value={backTo} />
            <PlanFields defaults={{ address: activity.address, scheduleText: activity.scheduleText }} />
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
