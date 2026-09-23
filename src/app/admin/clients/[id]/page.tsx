import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
  activities,
  attendances,
  plans,
  sessions,
  subscriptions,
  users,
} from "@/db/schema";
import {
  deleteClientAction,
  resendClientVerificationAction,
  setSubscriptionStatusAction,
  updateClientAction,
} from "@/app/actions/admin";
import {
  ATTENDANCE_STATUS,
  SUBSCRIPTION_STATUS,
  formatDate,
  formatPrice,
  formatTime,
  isPast,
  toAttendanceStatus,
  toSessionStatus,
  toSubscriptionStatus,
} from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";
import { localeNames, locales } from "@/i18n/config";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

/** Connexion temporairement bloquée après trop d'échecs de mot de passe. */
function isLocked(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

const PAYMENT_STATUSES = ["pending", "paid", "cancelled"] as const;
const toPaymentStatus = (value: string) =>
  (PAYMENT_STATUSES as readonly string[]).includes(value) ? (value as (typeof PAYMENT_STATUSES)[number]) : "pending";
const RESPONSE_CHANNELS = ["email", "espace-personnel", "administration"] as const;
const toChannel = (value: string | null) =>
  (RESPONSE_CHANNELS as readonly string[]).includes(value ?? "") ? (value as (typeof RESPONSE_CHANNELS)[number]) : "email";

export default async function AdminClientDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const { ok, erreur } = await searchParams;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const [locale, t, tCommon, tStatus, tAuth] = await Promise.all([
    getLocale(),
    getTranslations("admin.clientDetail"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("auth"),
  ]);

  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client) notFound();

  const [subs, history] = await Promise.all([
    db
      .select({ subscription: subscriptions, plan: plans, activity: activities })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .where(eq(subscriptions.userId, clientId))
      .orderBy(desc(subscriptions.createdAt)),
    db
      .select({ attendance: attendances, session: sessions, activity: activities })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(attendances.userId, clientId))
      .orderBy(desc(sessions.startsAt)),
  ]);

  const confirmed = history.filter((row) => row.attendance.status === "confirmed").length;
  const declined = history.filter((row) => row.attendance.status === "declined").length;
  const past = history.filter((row) => isPast(row.session.startsAt)).length;
  const back = `/admin/clients/${client.id}`;

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <nav className="text-sm text-zinc-500">
        <Link href="/admin/clients" className="hover:text-amber-300">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">
          {client.firstName} {client.lastName}
        </span>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("statSubs")} value={subs.length} />
        <Stat label={t("statSessions")} value={history.length} hint={t("statSessionsHint", { count: past })} />
        <Stat label={t("statConfirmed")} value={confirmed} />
        <Stat label={t("statDeclined")} value={declined} />
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">{t("title")}</h2>
          {client.emailVerifiedAt ? (
            <span className="badge border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
              {t("verified", { date: formatDate(client.emailVerifiedAt, locale) })}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge border-amber-500/30 bg-amber-500/15 text-amber-200">{t("notVerified")}</span>
              <form action={resendClientVerificationAction}>
                <input type="hidden" name="id" value={client.id} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  {t("resend")}
                </button>
              </form>
            </div>
          )}
        </div>
        {isLocked(client.lockedUntil) ? (
          <p className="mt-3 text-sm text-rose-300">{t("locked", { time: formatTime(client.lockedUntil!, locale) })}</p>
        ) : null}
        <form action={updateClientAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={client.id} />
          <div>
            <label className="label" htmlFor="firstName">
              {t("firstName")}
            </label>
            <input id="firstName" name="firstName" required maxLength={80} defaultValue={client.firstName} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="lastName">
              {t("lastName")}
            </label>
            <input id="lastName" name="lastName" required maxLength={80} defaultValue={client.lastName} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              {t("email")}
            </label>
            <input id="email" name="email" type="email" required maxLength={180} defaultValue={client.email} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              {t("phone")}
            </label>
            <input id="phone" name="phone" type="tel" maxLength={25} defaultValue={client.phone ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="city">
              {t("city")}
            </label>
            <input id="city" name="city" maxLength={120} defaultValue={client.city ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">
              {t("role")}
            </label>
            <select id="role" name="role" defaultValue={client.role} className="select">
              <option value="client">{tStatus("role.client")}</option>
              <option value="admin">{tStatus("role.admin")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="locale">
              {t("language")}
            </label>
            <select id="locale" name="locale" defaultValue={client.locale} className="select">
              {locales.map((option) => (
                <option key={option} value={option} lang={option}>
                  {localeNames[option].native}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t("resetPassword")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              placeholder={t("keepPassword")}
              className="input"
            />
            <p className="mt-1 text-xs text-zinc-500">{tAuth("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">
              {t("notes")}
            </label>
            <textarea id="notes" name="notes" maxLength={2000} defaultValue={client.notes ?? ""} className="textarea" />
          </div>
          <p className="text-xs text-zinc-500 sm:col-span-2">{t("sessionsNotice")}</p>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">
              {tCommon("save")}
            </button>
          </div>
        </form>
        <form action={deleteClientAction} className="mt-3">
          <input type="hidden" name="id" value={client.id} />
          <button className="btn btn-danger" type="submit">
            {t("deleteClient")}
          </button>
        </form>
      </Card>

      <section>
        <SectionTitle eyebrow={t("subsEyebrow")} title={t("subsTitle")} />
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("colActivity")}</th>
                <th>{t("colPlan")}</th>
                <th>{t("colPrice")}</th>
                <th>{t("colValidity")}</th>
                <th>{t("colSessions")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colPayment")}</th>
                <th>{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((row) => {
                const status = toSubscriptionStatus(row.subscription.status);
                return (
                  <tr key={row.subscription.id}>
                    <td className="text-zinc-200">{localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name}</td>
                    <td className="text-zinc-400">{localize(row.plan, locale, PLAN_TRANSLATABLE).name}</td>
                    <td className="whitespace-nowrap">{formatPrice(row.plan.priceCents, locale)}</td>
                    <td className="whitespace-nowrap text-zinc-400">
                      {tCommon("dateRange", {
                        start: formatDate(row.subscription.startsAt, locale),
                        end: formatDate(row.subscription.endsAt, locale),
                      })}
                    </td>
                    <td className="text-zinc-300" dir="ltr">
                      {row.subscription.sessionsUsed} / {row.subscription.sessionsIncluded}
                    </td>
                    <td>
                      <span className={`badge ${SUBSCRIPTION_STATUS[status]}`}>{tStatus(`subscription.${status}`)}</span>
                    </td>
                    <td className="text-zinc-400">{tStatus(`payment.${toPaymentStatus(row.subscription.paymentStatus)}`)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {row.subscription.paymentStatus !== "paid" ? (
                          <form action={setSubscriptionStatusAction}>
                            <input type="hidden" name="id" value={row.subscription.id} />
                            <input type="hidden" name="userId" value={client.id} />
                            <input type="hidden" name="activityId" value={row.activity.id} />
                            <input type="hidden" name="sessionsIncluded" value={row.subscription.sessionsIncluded} />
                            <input type="hidden" name="action" value="markPaid" />
                            <input type="hidden" name="redirectTo" value={back} />
                            <button className="btn btn-primary btn-sm" type="submit">
                              {t("markPaid")}
                            </button>
                          </form>
                        ) : null}
                        {row.subscription.status !== "active" && row.subscription.paymentStatus === "paid" ? (
                          <form action={setSubscriptionStatusAction}>
                            <input type="hidden" name="id" value={row.subscription.id} />
                            <input type="hidden" name="userId" value={client.id} />
                            <input type="hidden" name="action" value="activate" />
                            <input type="hidden" name="redirectTo" value={back} />
                            <button className="btn btn-ghost btn-sm" type="submit">
                              {t("activate")}
                            </button>
                          </form>
                        ) : null}
                        <form action={setSubscriptionStatusAction}>
                          <input type="hidden" name="id" value={row.subscription.id} />
                          <input type="hidden" name="userId" value={client.id} />
                          <input type="hidden" name="action" value="extend" />
                          <input type="hidden" name="redirectTo" value={back} />
                          <button className="btn btn-ghost btn-sm" type="submit">
                            {t("extend")}
                          </button>
                        </form>
                        {row.subscription.status !== "cancelled" ? (
                          <form action={setSubscriptionStatusAction}>
                            <input type="hidden" name="id" value={row.subscription.id} />
                            <input type="hidden" name="userId" value={client.id} />
                            <input type="hidden" name="action" value="cancel" />
                            <input type="hidden" name="redirectTo" value={back} />
                            <button className="btn btn-danger btn-sm" type="submit">
                              {t("cancelSub")}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {subs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-zinc-500">
                    {t("noSubs")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={t("historyEyebrow")} title={t("historyTitle")} />
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("colDate")}</th>
                <th>{t("colActivity")}</th>
                <th>{t("colSession")}</th>
                <th>{t("colPlace")}</th>
                <th>{t("colSessionStatus")}</th>
                <th>{t("colAttendance")}</th>
                <th>{t("colResponse")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const attendance = toAttendanceStatus(row.attendance.status);
                const session = localize(row.session, locale, SESSION_TRANSLATABLE);
                const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
                return (
                  <tr key={row.attendance.id}>
                    <td className="whitespace-nowrap">
                      {formatDate(session.startsAt, locale)}
                      <span className="block text-xs text-zinc-500">{formatTime(session.startsAt, locale)}</span>
                    </td>
                    <td className="text-zinc-200">{activity.name}</td>
                    <td className="text-zinc-400">{session.title ?? tCommon("none")}</td>
                    <td className="text-zinc-400">{session.location ?? activity.address}</td>
                    <td className="text-zinc-400">{tStatus(`session.${toSessionStatus(session.status)}`)}</td>
                    <td>
                      <span className={`badge ${ATTENDANCE_STATUS[attendance].className}`}>
                        {ATTENDANCE_STATUS[attendance].dot} {tStatus(`attendance.${attendance}`)}
                      </span>
                    </td>
                    <td className="text-xs text-zinc-500">
                      {row.attendance.respondedAt
                        ? `${formatDate(row.attendance.respondedAt, locale)} (${tStatus(
                            `channel.${toChannel(row.attendance.responseChannel)}`,
                          )})`
                        : tCommon("none")}
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-zinc-500">
                    {t("noHistory")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
