import Link from "next/link";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, CATEGORY_TRANSLATABLE, SESSION_TRANSLATABLE, activities, categories, sessions } from "@/db/schema";
import { SESSION_STATUS_STYLES, formatDate, formatDuration, formatTime, isPast, toSessionStatus } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string; vue?: string }>;
}) {
  const { ok, erreur, vue } = await searchParams;
  const scope = vue === "passees" ? "past" : vue === "toutes" ? "all" : "upcoming";
  const [locale, t, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.sessions"),
    getTranslations("common"),
    getTranslations("status"),
  ]);

  const conditions =
    scope === "past" ? [lt(sessions.startsAt, new Date())] : scope === "all" ? [] : [gte(sessions.startsAt, new Date())];

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
    .orderBy(asc(sessions.startsAt));

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
            href={`/admin/seances?vue=${option.key}`}
            className={`btn btn-sm ${scope === option.scope ? "btn-primary" : "btn-ghost"}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

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
