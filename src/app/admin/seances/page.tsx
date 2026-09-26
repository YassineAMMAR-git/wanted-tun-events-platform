import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, CATEGORY_TRANSLATABLE, SESSION_TRANSLATABLE, activities, categories, sessions } from "@/db/schema";
import { SESSION_STATUS_STYLES, formatDate, formatDuration, formatTime, isPast, parseParisDateTime, toSessionStatus } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { FilterBar, FilterDate, FilterSelect, FilterText } from "@/components/filter-bar";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    erreur?: string;
    vue?: string;
    q?: string;
    activite?: string;
    statut?: string;
    du?: string;
    au?: string;
    tri?: string;
  }>;
}) {
  const { ok, erreur, vue, q, activite, statut, du, au, tri } = await searchParams;
  const scope = vue === "passees" ? "past" : vue === "toutes" ? "all" : "upcoming";
  const [locale, t, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.sessions"),
    getTranslations("common"),
    getTranslations("status"),
  ]);

  const search = q?.trim().slice(0, 100);
  const conditions: SQL[] =
    scope === "past" ? [lt(sessions.startsAt, new Date())] : scope === "all" ? [] : [gte(sessions.startsAt, new Date())];

  if (search) {
    const like = `%${search}%`;
    conditions.push(or(ilike(sessions.title, like), ilike(sessions.location, like), ilike(activities.name, like))!);
  }
  if (activite) conditions.push(eq(sessions.activityId, Number(activite)));
  if (statut) conditions.push(eq(sessions.status, statut));
  // Les bornes sont interprétées en heure de Paris, comme le reste des dates de l'application.
  const from = du ? parseParisDateTime(`${du}T00:00`) : null;
  const to = au ? parseParisDateTime(`${au}T23:59`) : null;
  if (from) conditions.push(gte(sessions.startsAt, from));
  if (to) conditions.push(lte(sessions.startsAt, to));

  const order = tri === "recent" ? [desc(sessions.startsAt)] : [asc(sessions.startsAt)];

  const activityList = await db.select().from(activities).orderBy(asc(activities.name));

  const rows = await db
    .select({
      session: sessions,
      activity: activities,
      category: categories,
      total: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id})::int`,
      confirmed: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id} and a.status = 'confirmed')::int`,
      declined: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id} and a.status = 'declined')::int`,
    })
    .from(sessions)
    .innerJoin(activities, eq(activities.id, sessions.activityId))
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...order);

  const filtered = Boolean(search || activite || statut || du || au || tri);

  /** Conserve les filtres courants quand on change d'onglet de vue. */
  const viewHref = (view: string) => {
    const params = new URLSearchParams();
    params.set("vue", view);
    for (const [key, value] of Object.entries({ q: search, activite, statut, du, au, tri })) {
      if (value) params.set(key, value);
    }
    return `/admin/seances?${params.toString()}`;
  };

  const totals = rows.reduce(
    (acc, row) => ({
      participants: acc.participants + row.total,
      confirmed: acc.confirmed + row.confirmed,
      declined: acc.declined + row.declined,
    }),
    { participants: 0, confirmed: 0, declined: 0 },
  );

  const views = [
    { key: "upcoming", scope: "upcoming", label: t("viewUpcoming") },
    { key: "passees", scope: "past", label: t("viewPast") },
    { key: "toutes", scope: "all", label: t("viewAll") },
  ];

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("statShown")} value={rows.length} />
        <Stat label={t("statParticipants")} value={totals.participants} />
        <Stat label={t("statConfirmed")} value={totals.confirmed} />
        <Stat label={t("statDeclined")} value={totals.declined} />
      </section>

      <div className="flex flex-wrap gap-2">
        {views.map((option) => (
          <Link
            key={option.key}
            href={viewHref(option.key)}
            className={`btn btn-sm ${scope === option.scope ? "btn-primary" : "btn-ghost"}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <FilterBar action="/admin/seances" active={filtered} submitLabel={tCommon("search")} resetLabel={tCommon("reset")}>
        {/* La vue courante suit le formulaire : filtrer ne renvoie pas sur « à venir ». */}
        <input type="hidden" name="vue" value={vue ?? ""} />
        <FilterText name="q" label={tCommon("search")} defaultValue={search} placeholder={t("searchPlaceholder")} />
        <FilterSelect
          name="activite"
          label={t("filterActivity")}
          defaultValue={activite}
          placeholder={tCommon("all")}
          options={activityList.map((row) => ({
            value: String(row.id),
            label: localize(row, locale, ACTIVITY_TRANSLATABLE).name ?? "",
          }))}
        />
        <FilterSelect
          name="statut"
          label={t("filterStatus")}
          defaultValue={statut}
          placeholder={tCommon("all")}
          options={(["scheduled", "cancelled", "postponed", "done"] as const).map((value) => ({
            value,
            label: tStatus(`session.${value}`),
          }))}
        />
        <FilterSelect
          name="tri"
          label={tCommon("sortBy")}
          defaultValue={tri}
          options={[
            { value: "", label: t("sortSoonest") },
            { value: "recent", label: t("sortLatest") },
          ]}
        />
        <FilterDate name="du" label={t("filterFrom")} defaultValue={du} />
        <FilterDate name="au" label={t("filterTo")} defaultValue={au} />
      </FilterBar>

      <p className="text-sm text-zinc-400">{t("resultCount", { count: rows.length })}</p>

      <div className="card scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t("colDate")}</th>
              <th>{t("colActivity")}</th>
              <th>{t("colSession")}</th>
              <th>{t("colPlace")}</th>
              <th>{t("colDuration")}</th>
              <th>{t("colRegistered")}</th>
              <th>🟢 / 🟠 / 🔴</th>
              <th>{t("colStatus")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const session = localize(row.session, locale, SESSION_TRANSLATABLE);
              const past = isPast(session.startsAt);
              const status = toSessionStatus(session.status);
              return (
                <tr key={session.id}>
                  <td className="whitespace-nowrap">
                    <span className={past ? "text-zinc-400" : "text-emerald-300"}>
                      {past ? "⚪" : "🟢"} {formatDate(session.startsAt, locale)}
                    </span>
                    <span className="block text-xs text-zinc-500">{formatTime(session.startsAt, locale)}</span>
                  </td>
                  <td>
                    <Link href={`/admin/activites/${row.activity.id}`} className="text-zinc-200 hover:text-amber-300">
                      {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}
                    </Link>
                    <span className="block text-xs text-zinc-500">{localize(row.category, locale, CATEGORY_TRANSLATABLE).name}</span>
                  </td>
                  <td className="text-zinc-400">{session.title ?? tCommon("none")}</td>
                  <td className="text-zinc-400">{session.location ?? tCommon("none")}</td>
                  <td className="whitespace-nowrap text-zinc-400">{formatDuration(session.durationMinutes, locale)}</td>
                  <td className="font-semibold text-white">{row.total}</td>
                  <td className="whitespace-nowrap" dir="ltr">
                    <span className="text-emerald-300">{row.confirmed}</span> /{" "}
                    <span className="text-amber-300">{Math.max(row.total - row.confirmed - row.declined, 0)}</span> /{" "}
                    <span className="text-rose-300">{row.declined}</span>
                  </td>
                  <td>
                    <span className={`badge ${SESSION_STATUS_STYLES[status]}`}>{tStatus(`session.${status}`)}</span>
                  </td>
                  <td>
                    <Link href={`/admin/seances/${session.id}`} className="btn btn-ghost btn-sm">
                      {t("participants")}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-zinc-500">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Card>
        <p className="text-sm text-zinc-400">{t("tip")}</p>
      </Card>
    </div>
  );
}
