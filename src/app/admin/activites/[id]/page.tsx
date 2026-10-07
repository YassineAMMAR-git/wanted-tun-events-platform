import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { CATEGORY_TRANSLATABLE, activities, categories, plans, sessions, ticketPrices } from "@/db/schema";
import { ticketsSold } from "@/lib/subscriptions";
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
import {
  SESSION_STATUS_STYLES,
  centsToEurosInput,
  formatDateTime,
  formatPrice,
  isPast,
  sessionDisplayStatus,
  toDateTimeLocalValue,
  minutesToHoursInput,
} from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";
import { ImageUploadField } from "@/components/image-upload-field";
import { TicketPriceFields } from "@/components/ticket-price-fields";
import { PlanFields } from "@/app/admin/_components/plan-fields";
import { isRecurring } from "@/lib/memberships";

export const dynamic = "force-dynamic";

export default async function AdminActivityDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; dupliquer?: string }>;
}) {
  const { id } = await params;
  const { ok, erreur, dupliquer } = await searchParams;
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

  const [categoryList, sessionList, planList, priceList] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select().from(sessions).where(eq(sessions.activityId, activityId)).orderBy(desc(sessions.startsAt)),
    db.select().from(plans).where(eq(plans.activityId, activityId)).orderBy(asc(plans.priceCents)),
    db
      .select()
      .from(ticketPrices)
      .where(eq(ticketPrices.activityId, activityId))
      .orderBy(asc(ticketPrices.position), asc(ticketPrices.id)),
  ]);

  // « Dupliquer cette séance » : le formulaire d'ajout est prérempli avec la séance choisie, une semaine plus tard.
  const duplicated = dupliquer ? sessionList.find((session) => session.id === Number(dupliquer)) : undefined;
  const duplicatedStart = duplicated
    ? toDateTimeLocalValue(new Date(duplicated.startsAt.getTime() + 7 * 24 * 60 * 60 * 1000))
    : "";
  // Dernière séance créée (et non la plus tardive) : c'est elle que l'on vient d'ajouter.
  const lastCreated = sessionList.reduce<(typeof sessionList)[number] | undefined>(
    (latest, session) => (!latest || session.id > latest.id ? session : latest),
    undefined,
  );

  const upcoming = sessionList.filter((s) => !isPast(s.startsAt) && s.status === "scheduled").length;
  const backTo = `/admin/activites/${activity.id}`;
  const memberships = isRecurring(activity);
  // Billets payés par date : billets d'un événement unique, ou séances achetées à l'unité.
  const sold = await ticketsSold(sessionList.map((session) => session.id));
  const totalSold = [...sold.values()].reduce((total, count) => total + count, 0);
  const d = (key: "sessionsTitle" | "sessionsSubtitle" | "addSession" | "noSessions" | "startsAt" | "sessionsEyebrow") =>
    memberships ? t(key) : t(`event.${key}`);

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />

      <nav className="text-sm text-zinc-500">
        <Link href="/admin/activites" className="hover:text-gold-dark">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-700">{activity.name}</span>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={memberships ? t("statSessions") : t("event.statDates")}
          value={sessionList.length}
          hint={t("statSessionsHint", { count: upcoming })}
        />
        {memberships ? (
          <Stat
            label={t("statPlans")}
            value={planList.length}
            hint={t("statPlansHint", { count: planList.filter((p) => p.isActive).length })}
          />
        ) : (
          <Stat label={t("event.statTickets")} value={totalSold} hint={t("event.statTicketsHint")} />
        )}
        <Stat label={memberships ? t("statCapacity") : t("event.statCapacity")} value={activity.capacity} />
        <Stat
          label={memberships ? t("statPrice") : t("event.statPrice")}
          value={formatPrice(activity.priceCents, locale)}
        />
      </section>

      {/* ------------------------------ activité ------------------------------ */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">{t("editTitle")}</h2>
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
          <div className="sm:col-span-2">
            <label className="label" htmlFor="kind">
              {t("kind")}
            </label>
            <select id="kind" name="kind" defaultValue={memberships ? "recurring" : "single"} className="select">
              <option value="single">{t("kindSingle")}</option>
              <option value="recurring">{t("kindRecurring")}</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">{t("kindHint")}</p>
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
              name="durationHours"
              type="number"
              min={0.25}
              step="any"
              defaultValue={minutesToHoursInput(activity.durationMinutes)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="price">
              {memberships ? t("price") : t("event.price")}
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
          {/* Tarifs : uniquement pour un événement unique (une activité à séances a ses abonnements). */}
          {memberships ? null : (
            <div className="sm:col-span-2">
              <TicketPriceFields initial={priceList} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="capacity">
              {memberships ? t("capacity") : t("event.capacity")}
            </label>
            <input id="capacity" name="capacity" type="number" min={1} defaultValue={activity.capacity} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ticketUrl">
              {t("ticketUrl")}
            </label>
            <input
              id="ticketUrl"
              name="ticketUrl"
              type="url"
              maxLength={500}
              defaultValue={activity.ticketUrl ?? ""}
              placeholder="https://…"
              className="input"
              dir="ltr"
            />
            <p className="mt-1 text-xs text-zinc-500">{t("ticketUrlHint")}</p>
          </div>
          <div className="sm:col-span-2">
            <ImageUploadField name="imageUrl" label={t("image")} hint={t("imageHint")} defaultValue={activity.imageUrl} />
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
        <SectionTitle eyebrow={d("sessionsEyebrow")} title={d("sessionsTitle")} subtitle={d("sessionsSubtitle")} />

        {memberships || sessionList.length === 0 ? (
        <Card className={`mb-5 ${duplicated ? "border-amber-300" : ""}`}>
          <div id="nouvelle-seance" className="mb-3 flex scroll-mt-24 flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900">
              {duplicated
                ? t("duplicating", { date: formatDateTime(duplicated.startsAt, locale) })
                : d("addSession")}
            </p>
            {duplicated ? (
              <Link href={backTo} className="btn btn-ghost btn-sm">
                {t("duplicateCancel")}
              </Link>
            ) : memberships && lastCreated ? (
              <Link href={`${backTo}?dupliquer=${lastCreated.id}#nouvelle-seance`} className="btn btn-ghost btn-sm">
                📄 {t("duplicateLast")}
              </Link>
            ) : null}
          </div>
          {duplicated ? <p className="mb-3 text-xs text-zinc-600">{t("duplicateHint")}</p> : null}
          {/* La clé force le formulaire à repartir des nouvelles valeurs quand on change de séance à dupliquer. */}
          <form
            key={duplicated?.id ?? "new"}
            action={createSessionAction}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="activityId" value={activity.id} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TranslationFields
                gridClassName="grid gap-3 sm:grid-cols-2"
                values={duplicated ? { title: duplicated.title, notes: duplicated.notes } : undefined}
                translations={duplicated?.translations}
                fields={[
                  { name: "title", label: t("sessionTitle"), maxLength: 180, placeholder: t("sessionTitlePlaceholder") },
                  { name: "notes", label: t("notes"), maxLength: 2000 },
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="startsAt">
                {d("startsAt")}
              </label>
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={duplicatedStart}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="duration">
                {t("duration")}
              </label>
              <input
                id="duration"
                name="durationHours"
                type="number"
                min={0.25}
                step="any"
                defaultValue={minutesToHoursInput(duplicated?.durationMinutes ?? activity.durationMinutes)}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="location">
                {t("location")}
              </label>
              <input
                id="location"
                name="location"
                maxLength={240}
                defaultValue={duplicated ? (duplicated.location ?? "") : (activity.address ?? "")}
                className="input"
              />
            </div>
            <div className="lg:col-span-3">
              <button className="btn btn-primary" type="submit">
                {d("addSession")}
              </button>
            </div>
          </form>
        </Card>
        ) : null}

        <div className="space-y-3">
          {sessionList.map((session) => {
            const past = isPast(session.startsAt);
            return (
              <div key={session.id} className={`card p-4 ${past ? "opacity-70" : ""}`}>
                <p className="mb-3 text-xs text-zinc-500">
                  {past ? "⚪" : "🟢"} {formatDateTime(session.startsAt, locale)}{" "}
                  <span className={`badge ms-1 ${SESSION_STATUS_STYLES[sessionDisplayStatus(session)]}`}>
                    {tStatus(`session.${sessionDisplayStatus(session)}`)}
                  </span>
                  {memberships
                    ? (sold.get(session.id) ?? 0) > 0
                      ? ` · ${t("sessionTickets", { count: sold.get(session.id) ?? 0 })}`
                      : null
                    : ` · ${t("event.sold", { sold: sold.get(session.id) ?? 0, capacity: activity.capacity })}`}
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
                    <input
                      name="durationHours"
                      type="number"
                      min={0.25}
                      step="any"
                      defaultValue={minutesToHoursInput(session.durationMinutes)}
                      className="input"
                    />
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
                  {memberships ? (
                    <Link href={`${backTo}?dupliquer=${session.id}#nouvelle-seance`} className="btn btn-ghost btn-sm">
                      📄 {t("duplicateSession")}
                    </Link>
                  ) : null}
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
          {sessionList.length === 0 ? <p className="text-sm text-zinc-500">{d("noSessions")}</p> : null}
        </div>
      </section>

      {/* -------------------------------- offres -------------------------------- */}
      {memberships || planList.length > 0 ? (
      <section>
        <SectionTitle eyebrow={t("plansEyebrow")} title={t("plansTitle")} subtitle={t("plansSubtitle")} />
        {memberships ? (
          <>
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
              <h3 className="text-base font-bold text-zinc-900">{t("addPlan")}</h3>
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
          </>
        ) : (
          <Card className="border-amber-200 bg-gold-soft">
            <p className="text-sm text-zinc-700">🎟️ {t("plansSingleNotice")}</p>
            <Link href="/admin/abonnements#anciennes-offres" className="mt-2 inline-block text-sm font-medium text-gold-dark hover:underline">
              {t("plansLegacy", { count: planList.length })}
            </Link>
          </Card>
        )}
      </section>
      ) : null}
    </div>
  );
}
