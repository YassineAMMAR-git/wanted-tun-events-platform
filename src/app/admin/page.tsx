import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, SESSION_TRANSLATABLE, activities, sessions, subscriptions, users } from "@/db/schema";
import { getAdminStats } from "@/lib/queries";
import { runRemindersAction } from "@/app/actions/admin";
import { formatDate, formatTime, toSubscriptionStatus } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES = ["pending", "declared", "paid", "cancelled"] as const;
const toPaymentStatus = (value: string) =>
  (PAYMENT_STATUSES as readonly string[]).includes(value) ? (value as (typeof PAYMENT_STATUSES)[number]) : "pending";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const [locale, t, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.dashboard"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const [stats, upcoming, latestClients, latestSubs] = await Promise.all([
    getAdminStats(),
    db
      .select({
        session: sessions,
        activity: activities,
        total: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id})::int`,
        confirmed: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id} and a.status = 'confirmed')::int`,
        declined: sql<number>`(select count(*) from attendances a where a.session_id = ${sessions.id} and a.status = 'declined')::int`,
      })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(and(eq(sessions.status, "scheduled"), gte(sessions.startsAt, new Date())))
      .orderBy(asc(sessions.startsAt))
      .limit(8),
    db
      .select({ user: users, subs: sql<number>`(select count(*) from subscriptions s where s.user_id = ${users.id})::int` })
      .from(users)
      .where(eq(users.role, "client"))
      .orderBy(desc(users.createdAt))
      .limit(6),
    db
      .select({ subscription: subscriptions, activity: activities, userName: users.firstName, userLast: users.lastName })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(6),
  ]);

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("clients")} value={stats.clients} />
        <Stat label={t("activities")} value={stats.activities} />
        <Stat label={t("scheduled")} value={stats.upcomingSessions} hint={t("scheduledHint", { count: stats.sessions })} />
        <Stat
          label={t("activeSubs")}
          value={stats.activeSubscriptions}
          hint={t("activeSubsHint", { count: stats.pendingPayments })}
        />
        <Stat label={t("confirmed")} value={stats.confirmations} />
        <Stat label={t("awaiting")} value={stats.awaiting} />
        <Stat label={t("declined")} value={stats.declines} />
        <Stat label={t("reminders")} value={stats.reminders} />
      </section>

      <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-white">{t("engineTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t("engineText")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={runRemindersAction}>
            <button className="btn btn-primary btn-sm" type="submit">
              {t("runNow")}
            </button>
          </form>
          <Link href="/admin/notifications" className="btn btn-ghost btn-sm">
            {t("log")}
          </Link>
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={t("upcomingEyebrow")} title={t("upcomingTitle")} subtitle={t("upcomingSubtitle")} />
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("activity")}</th>
                <th>{t("session")}</th>
                <th>{t("registered")}</th>
                <th>{t("colConfirmed")}</th>
                <th>{t("colAwaiting")}</th>
                <th>{t("colDeclined")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => {
                const session = localize(row.session, locale, SESSION_TRANSLATABLE);
                return (
                  <tr key={session.id}>
                    <td className="whitespace-nowrap">
                      {formatDate(session.startsAt, locale)}
                      <span className="block text-xs text-zinc-500">{formatTime(session.startsAt, locale)}</span>
                    </td>
                    <td className="text-zinc-300">{localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}</td>
                    <td className="text-zinc-400">{session.title ?? tCommon("none")}</td>
                    <td className="font-semibold text-white">{row.total}</td>
                    <td className="text-emerald-300">{row.confirmed}</td>
                    <td className="text-amber-300">{Math.max(row.total - row.confirmed - row.declined, 0)}</td>
                    <td className="text-rose-300">{row.declined}</td>
                    <td>
                      <Link href={`/admin/seances/${session.id}`} className="btn btn-ghost btn-sm">
                        {tCommon("manage")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {upcoming.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-zinc-500">
                    {t("noUpcoming")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">{t("latestClients")}</h2>
            <Link href="/admin/clients" className="text-xs font-semibold text-amber-300 hover:underline">
              {tCommon("seeAll")}
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {latestClients.map((row) => (
              <li key={row.user.id} className="flex items-center justify-between gap-3 border-b border-white/6 pb-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {row.user.firstName} {row.user.lastName}
                  </p>
                  <p className="text-xs text-zinc-500" dir="ltr">
                    {row.user.email}
                  </p>
                </div>
                <Link href={`/admin/clients/${row.user.id}`} className="btn btn-ghost btn-sm">
                  {t("subsShort", { count: row.subs })}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">{t("latestSubs")}</h2>
            <Link href="/admin/abonnements" className="text-xs font-semibold text-amber-300 hover:underline">
              {t("offers")}
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {latestSubs.map((row) => (
              <li key={row.subscription.id} className="flex items-center justify-between gap-3 border-b border-white/6 pb-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {row.userName} {row.userLast} — {localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t("subStatus", {
                      status: tStatus(`subscription.${toSubscriptionStatus(row.subscription.status)}`),
                      payment: tStatus(`payment.${toPaymentStatus(row.subscription.paymentStatus)}`),
                    })}
                  </p>
                </div>
                <Link href={`/admin/clients/${row.subscription.userId}`} className="btn btn-ghost btn-sm">
                  {t("file")}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
