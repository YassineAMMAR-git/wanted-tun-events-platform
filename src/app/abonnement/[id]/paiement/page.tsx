import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
  activities,
  plans,
  sessions,
  subscriptions,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { cancelPendingAction, declarePaymentAction, startPaymentAction } from "@/app/actions/booking";
import { formatDate, formatDuration, formatPrice, formatTime, isPast } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { CONTACT_EMAIL } from "@/lib/site";
import { Card } from "@/components/ui";
import { PaymentWatcher } from "@/components/payment-watcher";
import { latestPaymentLink, onlinePaymentsEnabled } from "@/lib/mollie/payments";

export const dynamic = "force-dynamic";

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ declare?: string; lien?: string; retour?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const { id } = await params;
  const { declare, lien, retour } = await searchParams;
  const subscriptionId = Number(id);
  if (!Number.isFinite(subscriptionId)) notFound();

  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("payment"), getTranslations("common")]);

  const row = (
    await db
      .select({ subscription: subscriptions, plan: plans, session: sessions, activity: activities })
      .from(subscriptions)
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(sessions, eq(sessions.id, subscriptions.sessionId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];

  if (!row) notFound();
  const { subscription } = row;
  const ticket = subscription.kind === "ticket";
  const plan = row.plan ? localize(row.plan, locale, PLAN_TRANSLATABLE) : null;
  const session = row.session ? localize(row.session, locale, SESSION_TRANSLATABLE) : null;
  const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
  if (!ticket && !plan) notFound();
  const paymentUrl = plan?.paymentUrl ?? null;
  const address = [activity.address, activity.city].filter(Boolean).join(", ");

  // Billet non payé pour une date annulée, supprimée ou passée : il n'est plus en vente.
  const ticketClosed =
    ticket &&
    subscription.paymentStatus !== "paid" &&
    (!row.session || row.session.status !== "scheduled" || isPast(row.session.startsAt));

  // Commande annulée par le client avant paiement.
  const cancelled = subscription.status === "cancelled" && subscription.paymentStatus !== "paid";

  // Paiement Mollie : relu chez Mollie à chaque affichage (notamment au retour du client), ce qui active la commande si elle est payée.
  const online = await onlinePaymentsEnabled();
  const link = online && subscription.paymentStatus !== "paid" && !ticketClosed && !cancelled ? await latestPaymentLink(subscription.id) : null;
  // Retour de Mollie : « ouvert » peut vouloir dire que la confirmation n'est pas encore arrivée (on vérifie
  // quelques secondes) ; annulé, refusé ou expiré signifie que le paiement n'a pas abouti.
  const verifying = Boolean(retour) && link?.status === "open";
  const notCompleted = Boolean(retour) && (link?.status === "canceled" || link?.status === "expired");

  const alreadyPaid = subscription.paymentStatus === "paid" || link?.status === "paid";
  const awaitingCheck = subscription.paymentStatus === "declared";
  const price = formatPrice(ticket ? (subscription.amountCents ?? activity.priceCents) : plan!.priceCents, locale);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <nav className="text-sm text-zinc-500">
        <Link href={`/activites/${activity.slug}`} className="hover:text-gold-dark">
          {activity.name}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-700">{t("breadcrumb")}</span>
      </nav>

      <div className="text-center">
        <p className="eyebrow">{t("step")}</p>
        <h1 className="mt-1.5 text-2xl font-black text-zinc-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{ticket ? t("ticketIntro") : t("intro")}</p>
      </div>

      {declare ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t("declaredFlash")}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-wider text-zinc-500 uppercase">{ticket ? t("ticket") : t("selectedPlan")}</p>
            <h2 className="mt-1 text-xl font-bold text-zinc-900">{ticket ? activity.name : plan!.name}</h2>
            <p className="text-sm text-zinc-600">{ticket ? (subscription.priceLabel ?? session?.title ?? t("ticketOne")) : activity.name}</p>
          </div>
          <div className="text-end">
            <p className="text-xs tracking-wider text-zinc-500 uppercase">{t("price")}</p>
            <p className="text-2xl font-black text-gold-dark">{price}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {(ticket
            ? [
                [t("eventDate"), session ? formatDate(session.startsAt, locale) : tCommon("none")],
                [
                  t("eventTime"),
                  session
                    ? `${formatTime(session.startsAt, locale)} (${formatDuration(session.durationMinutes, locale)})`
                    : tCommon("none"),
                ],
                [t("address"), session?.location || address || tCommon("none")],
                [t("reference"), `#${subscription.id}`],
              ]
            : [
                [t("sessionsIncluded"), String(plan!.sessionsIncluded)],
                [t("validity"), tCommon("days", { count: plan!.validityDays })],
                [t("address"), plan!.address ?? activity.address ?? tCommon("none")],
                [t("schedule"), plan!.scheduleText ?? activity.scheduleText ?? tCommon("none")],
                [t("start"), formatDate(subscription.startsAt, locale)],
                [t("end"), formatDate(subscription.endsAt, locale)],
              ]
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <dt className="text-xs tracking-wider text-zinc-500 uppercase">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-800">{value}</dd>
            </div>
          ))}
        </dl>

        {plan?.extraInfo ? (
          <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">ℹ️ {plan.extraInfo}</p>
        ) : null}

        {online || alreadyPaid || ticketClosed || cancelled ? null : (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-gold-dark">{t("externalLink")}</p>
            <p className="mt-1 text-xs break-all text-zinc-600" dir="ltr">
              {paymentUrl ?? t("notConfigured")}
            </p>
          </div>
        )}

        {alreadyPaid ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/espace-personnel" className="btn btn-primary flex-1">
              {ticket ? t("seeTickets") : t("seeSessions")}
            </Link>
            <span className="btn btn-ghost flex-1">{ticket ? t("ticketConfirmed") : t("alreadyActive")}</span>
          </div>
        ) : cancelled ? (
          <div className="mt-5 space-y-3">
            <div role="status" className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              {t("orderCancelled")}
            </div>
            <Link href={`/activites/${activity.slug}`} className="btn btn-primary w-full">
              {t("backToActivity")}
            </Link>
          </div>
        ) : ticketClosed ? (
          <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {t("ticketClosed")}
          </div>
        ) : online ? (
          <div className="mt-5 space-y-3">
            {lien === "erreur" ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                ⚠️ {t("onlineError")}
              </div>
            ) : notCompleted ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
                {t("onlineNotCompleted")}
              </div>
            ) : null}

            {link?.status === "processing" ? (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-gold-dark">{t("onlineProcessingTitle")}</p>
                  <p className="mt-1 text-xs text-zinc-700">{t("onlineProcessingText")}</p>
                </div>
                <PaymentWatcher label={t("onlineWatching")} />
              </>
            ) : (
              <form action={startPaymentAction}>
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <button className="btn btn-primary w-full" type="submit">
                  🔒 {notCompleted ? t("onlineRetry", { price }) : t("onlinePay", { price })}
                </button>
                <p className="mt-2 text-center text-xs text-zinc-600">{verifying ? t("onlineVerifying") : t("onlineHint")}</p>
                {verifying ? (
                  <div className="mt-2">
                    <PaymentWatcher label={t("onlineWatching")} maxDurationMs={60 * 1000} />
                  </div>
                ) : null}
              </form>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {awaitingCheck ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-gold-dark">{t("awaitingTitle")}</p>
                <p className="mt-1 text-xs text-zinc-700">{t("awaitingText")}</p>
                {subscription.paymentReference ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    {t("reference")} : <span dir="ltr">{subscription.paymentReference}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {paymentUrl ? (
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full">
                {t("pay", { price })}
              </a>
            ) : null}

            {awaitingCheck ? null : (
              <form action={declarePaymentAction} className="card border-amber-200 p-4">
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <label className="label" htmlFor="reference">
                  {t("reference")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="reference"
                    name="reference"
                    className="input"
                    maxLength={120}
                    placeholder={t("referencePlaceholder")}
                    defaultValue={subscription.paymentReference ?? ""}
                  />
                  <button className="btn btn-ghost sm:w-auto" type="submit">
                    {t("paid")}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{t("paidHint")}</p>
              </form>
            )}
          </div>
        )}
      </Card>

      {!alreadyPaid && !cancelled && subscription.paymentStatus === "pending" && link?.status !== "processing" ? (
        <form action={cancelPendingAction} className="text-center">
          <input type="hidden" name="subscriptionId" value={subscription.id} />
          <button className="text-xs text-zinc-500 underline hover:text-rose-700" type="submit">
            {t("cancelOrder")}
          </button>
        </form>
      ) : null}

      <p className="text-center text-xs text-zinc-500">
        {ticket ? t("ticketHelp", { email: CONTACT_EMAIL }) : t("help", { email: CONTACT_EMAIL })}
      </p>
    </div>
  );
}
