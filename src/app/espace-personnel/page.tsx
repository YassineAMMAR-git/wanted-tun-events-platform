import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getMySessions, getMySubscriptions } from "@/lib/queries";
import { cancelPendingAction, respondAttendanceAction } from "@/app/actions/booking";
import {
  ATTENDANCE_STATUS,
  SESSION_STATUS_STYLES,
  SUBSCRIPTION_STATUS,
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  toAttendanceStatus,
  sessionDisplayStatus,
  toSessionStatus,
  toSubscriptionStatus,
} from "@/lib/format";
import { Card, EmptyState, Progress, SectionTitle, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ abonnement?: string; billet?: string; commande?: string; erreur?: string }>;
}) {
  const user = await requireUser();
  const flags = await searchParams;
  const [locale, t, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("dashboard"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const [allSubscriptionRows, sessionRows] = await Promise.all([
    getMySubscriptions(user.id, locale),
    getMySessions(user.id, locale),
  ]);
  // Une commande annulée sans avoir été payée (choisie par erreur) n'est plus affichée au client.
  const subscriptionRows = allSubscriptionRows.filter(
    (row) => !(row.subscription.status === "cancelled" && row.subscription.paymentStatus !== "paid"),
  );

  const now = new Date();
  const upcoming = sessionRows.filter((row) => row.session.startsAt.getTime() >= now.getTime());
  const past = sessionRows.filter((row) => row.session.startsAt.getTime() < now.getTime()).reverse();
  const memberships = subscriptionRows.flatMap((row) => (row.plan ? [{ ...row, plan: row.plan }] : []));
  const tickets = subscriptionRows.filter((row) => row.subscription.kind === "ticket");
  const activeSubscriptions = memberships.filter((row) => row.subscription.status === "active");
  const pendingPayments = subscriptionRows.filter(
    (row) =>
      (row.subscription.paymentStatus === "pending" || row.subscription.paymentStatus === "declared") &&
      row.subscription.status === "pending",
  );
  const remaining = activeSubscriptions.reduce(
    (total, row) => total + Math.max(row.plan.sessionsIncluded - row.attendedCount, 0),
    0,
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-zinc-900">{t("hello", { name: user.firstName })}</h1>
          <p className="mt-1.5 text-sm text-zinc-600">{t("intro")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/activites" className="btn btn-primary btn-sm">
            {t("newActivity")}
          </Link>
          <Link href="/espace-personnel/profil" className="btn btn-ghost btn-sm">
            {t("myInfo")}
          </Link>
        </div>
      </header>

      {flags.abonnement === "actif" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t("subscriptionActive")}
        </div>
      ) : null}
      {flags.billet === "confirme" || flags.billet === "deja" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {flags.billet === "confirme" ? t("ticketRegistered") : t("ticketAlreadyBought")}
        </div>
      ) : null}
      {flags.commande === "annulee" ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t("orderCancelled")}
        </div>
      ) : null}
      {flags.erreur === "paymentInProgress" ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
          {t("errors.paymentInProgress")}
        </div>
      ) : null}
      {flags.erreur === "subscriptionNotFound" ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t("errors.subscriptionNotFound")}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("stats.activeSubscriptions")} value={activeSubscriptions.length} />
        <Stat label={t("stats.upcoming")} value={upcoming.length} hint={t("stats.upcomingHint")} />
        <Stat label={t("stats.done")} value={past.length} hint={t("stats.doneHint")} />
        <Stat label={t("stats.remaining")} value={remaining} />
      </section>

      {pendingPayments.length > 0 ? (
        <section className="card border-amber-200 p-5">
          <h2 className="text-base font-bold text-gold-dark">{t("pendingTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-600">{t("pendingText")}</p>
          <ul className="mt-4 space-y-3">
            {pendingPayments.map((row) => (
              <li
                key={row.subscription.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{row.plan ? row.plan.name : t("ticketOf", { name: row.activity.name })}</p>
                  <p className="text-sm text-zinc-600">
                    {row.activity.name} · {formatPrice(row.priceCents, locale)} ·{" "}
                    {row.plan
                      ? tCommon("sessions", { count: row.plan.sessionsIncluded })
                      : row.session
                        ? formatDate(row.session.startsAt, locale)
                        : tCommon("none")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/abonnement/${row.subscription.id}/paiement`} className="btn btn-primary btn-sm">
                    {t("finalize")}
                  </Link>
                  {/* Un paiement déjà signalé est en cours de vérification : il ne s'annule pas d'ici. */}
                  {row.subscription.paymentStatus === "pending" ? (
                    <form action={cancelPendingAction}>
                      <input type="hidden" name="subscriptionId" value={row.subscription.id} />
                      <button className="btn btn-ghost btn-sm" type="submit">
                        {t("cancelOrder")}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tickets.length > 0 ? (
        <section>
          <SectionTitle eyebrow={t("ticketsEyebrow")} title={t("ticketsTitle")} subtitle={t("ticketsSubtitle")} />
          <div className="grid gap-4 lg:grid-cols-2">
            {tickets.map((row) => {
              const status = toSubscriptionStatus(row.subscription.status);
              const pending = row.subscription.status === "pending";
              return (
                <Card key={row.subscription.id} className="card-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="badge border-zinc-300 bg-zinc-50">
                        {row.categoryEmoji} {row.categoryName}
                      </span>
                      <h3 className="mt-2 text-lg font-bold text-zinc-900">{row.activity.name}</h3>
                      <p className="text-sm text-emerald-700">
                        {row.session
                          ? tCommon("dateAtTime", {
                              date: formatDate(row.session.startsAt, locale),
                              time: formatTime(row.session.startsAt, locale),
                            })
                          : tCommon("none")}
                      </p>
                      <p className="text-xs text-zinc-500">
                        📍 {row.session?.location || [row.activity.address, row.activity.city].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <span className={`badge ${SUBSCRIPTION_STATUS[status]}`}>{tStatus(`ticket.${status}`)}</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gold-dark">
                      {row.subscription.priceLabel ? `${row.subscription.priceLabel} · ` : ""}
                      {formatPrice(row.priceCents, locale)}
                    </span>
                    {pending ? (
                      <Link href={`/abonnement/${row.subscription.id}/paiement`} className="btn btn-primary btn-sm ms-3">
                        {t("finalize")}
                      </Link>
                    ) : (
                      <Link href={`/activites/${row.activity.slug}`} className="btn btn-ghost btn-sm ms-3">
                        {t("viewActivity")}
                      </Link>
                    )}
                    <span className="ms-auto text-xs text-zinc-500">{t("reference", { id: row.subscription.id })}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle eyebrow={t("subsEyebrow")} title={t("subsTitle")} subtitle={t("subsSubtitle")} />
        {memberships.length === 0 ? (
          <EmptyState title={t("noSubsTitle")} description={t("noSubsText")} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {memberships.map((row) => {
              const status = toSubscriptionStatus(row.subscription.status);
              const used = Math.max(row.attendedCount, row.subscription.sessionsUsed);
              const remainingForPlan = Math.max(row.plan.sessionsIncluded - used, 0);
              return (
                <Card key={row.subscription.id} className="card-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="badge border-zinc-300 bg-zinc-50">
                        {row.categoryEmoji} {row.categoryName}
                      </span>
                      <h3 className="mt-2 text-lg font-bold text-zinc-900">{row.activity.name}</h3>
                      <p className="text-sm text-zinc-600">
                        {t("offer", { name: row.plan.name, price: formatPrice(row.plan.priceCents, locale) })}
                      </p>
                    </div>
                    <span className={`badge ${SUBSCRIPTION_STATUS[status]}`}>{tStatus(`subscription.${status}`)}</span>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-zinc-500 uppercase">{t("address")}</dt>
                      <dd className="text-zinc-800">
                        {row.activity.address}
                        {row.activity.city ? `, ${row.activity.city}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500 uppercase">{t("schedule")}</dt>
                      <dd className="text-zinc-800">{row.activity.scheduleText}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500 uppercase">{t("validity")}</dt>
                      <dd className="text-zinc-800">
                        {tCommon("dateRange", {
                          start: formatDate(row.subscription.startsAt, locale),
                          end: formatDate(row.subscription.endsAt, locale),
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500 uppercase">{t("remaining")}</dt>
                      <dd className="font-semibold text-gold-dark">
                        {row.subscription.status === "active"
                          ? `${remainingForPlan} / ${row.plan.sessionsIncluded}`
                          : tCommon("none")}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <Progress value={Math.min(used, row.plan.sessionsIncluded)} max={row.plan.sessionsIncluded} />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link href={`/activites/${row.activity.slug}`} className="btn btn-ghost btn-sm">
                      {t("viewActivity")}
                    </Link>
                    <span className="ms-auto self-center text-xs text-zinc-500">
                      {t("reference", { id: row.subscription.id })}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle eyebrow={t("sessionsEyebrow")} title={t("sessionsTitle")} subtitle={t("sessionsSubtitle")} />
        {sessionRows.length === 0 ? (
          <EmptyState title={t("noSessionsTitle")} description={t("noSessionsText")} />
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-bold tracking-wider text-emerald-700 uppercase">
                {t("upcomingHeading", { count: upcoming.length })}
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("noUpcoming")}</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((row) => {
                    const attendance = toAttendanceStatus(row.attendance.status);
                    const sessionStatus = toSessionStatus(row.session.status);
                    return (
                      <li
                        key={row.attendance.id}
                        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span className="dot-live mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-400" />
                          <div>
                            <p className="font-semibold text-zinc-900">
                              {row.activity.name}
                              <span className="ms-2 text-xs font-normal text-zinc-500">
                                {row.categoryEmoji} {row.categoryName}
                              </span>
                            </p>
                            <p className="text-sm text-emerald-700">
                              {formatDate(row.session.startsAt, locale)} — {formatTime(row.session.startsAt, locale)} (
                              {formatDuration(row.session.durationMinutes, locale)})
                            </p>
                            <p className="text-xs text-zinc-500">📍 {row.session.location ?? row.activity.address}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <span className={`badge ${SESSION_STATUS_STYLES[sessionStatus]}`}>
                            {tStatus(`session.${sessionStatus}`)}
                          </span>
                          <span className={`badge ${ATTENDANCE_STATUS[attendance].className}`}>
                            {ATTENDANCE_STATUS[attendance].dot} {tStatus(`attendance.${attendance}`)}
                          </span>
                          {row.session.status === "scheduled" ? (
                            <div className="flex gap-2">
                              <form action={respondAttendanceAction}>
                                <input type="hidden" name="attendanceId" value={row.attendance.id} />
                                <input type="hidden" name="response" value="confirmed" />
                                <button className="btn btn-primary btn-sm" type="submit">
                                  {t("confirm")}
                                </button>
                              </form>
                              <form action={respondAttendanceAction}>
                                <input type="hidden" name="attendanceId" value={row.attendance.id} />
                                <input type="hidden" name="response" value="declined" />
                                <button className="btn btn-ghost btn-sm" type="submit">
                                  {t("absent")}
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold tracking-wider text-zinc-600 uppercase">
                {t("pastHeading", { count: past.length })}
              </h3>
              {past.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("noPast")}</p>
              ) : (
                <ul className="space-y-2">
                  {past.map((row) => {
                    const attendance = toAttendanceStatus(row.attendance.status);
                    return (
                      <li
                        key={row.attendance.id}
                        className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 opacity-80 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-400" />
                          <div>
                            <p className="text-sm text-zinc-700">{row.activity.name}</p>
                            <p className="text-xs text-zinc-500">
                              {formatDate(row.session.startsAt, locale)} — {formatTime(row.session.startsAt, locale)} ·{" "}
                              {tStatus(`session.${sessionDisplayStatus(row.session)}`)}
                            </p>
                          </div>
                        </div>
                        <span className={`badge ${ATTENDANCE_STATUS[attendance].className}`}>
                          {ATTENDANCE_STATUS[attendance].dot} {tStatus(`attendance.${attendance}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
