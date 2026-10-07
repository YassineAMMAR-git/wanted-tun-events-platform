import "server-only";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  activities,
  attendances,
  sessions,
  subscriptions,
  users,
  type Subscription,
} from "@/db/schema";
import { randomToken } from "@/lib/auth";
import { appUrl, logAndSend } from "@/lib/mailer";
import { formatDate, formatDateTime } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { translatorFor } from "@/i18n/translator";

/**
 * Crée (si besoin) les lignes de présence d'un client pour les séances à venir
 * d'une activité, dans la limite du nombre de séances incluses.
 */
export async function ensureAttendances(params: {
  userId: number;
  activityId: number;
  subscriptionId: number;
  limit: number;
}): Promise<number> {
  const upcoming = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.activityId, params.activityId),
        eq(sessions.status, "scheduled"),
        gt(sessions.startsAt, new Date()),
      ),
    )
    .orderBy(asc(sessions.startsAt))
    .limit(Math.max(params.limit, 0));

  if (upcoming.length === 0) return 0;

  const existing = await db
    .select({ sessionId: attendances.sessionId })
    .from(attendances)
    .where(
      and(
        eq(attendances.userId, params.userId),
        inArray(
          attendances.sessionId,
          upcoming.map((session) => session.id),
        ),
      ),
    );
  const known = new Set(existing.map((row) => row.sessionId));
  const missing = upcoming.filter((session) => !known.has(session.id));
  if (missing.length === 0) return 0;

  await db
    .insert(attendances)
    .values(
      missing.map((session) => ({
        sessionId: session.id,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        status: "pending" as const,
        token: randomToken(),
      })),
    )
    .onConflictDoNothing();

  return missing.length;
}

/**
 * Présences auxquelles donne droit une souscription payée :
 * les prochaines séances pour un abonnement, la seule date achetée pour un billet.
 */
export async function grantAttendances(subscription: Subscription): Promise<void> {
  if (subscription.kind === "ticket") {
    if (!subscription.sessionId) return;
    await db
      .insert(attendances)
      .values({
        sessionId: subscription.sessionId,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        status: "pending",
        token: randomToken(),
      })
      .onConflictDoNothing();
    return;
  }
  await ensureAttendances({
    userId: subscription.userId,
    activityId: subscription.activityId,
    subscriptionId: subscription.id,
    limit: subscription.sessionsIncluded,
  });
}

/**
 * Places occupées par séance : tous les inscrits (abonnés rattachés à la séance, billets payés, ajouts manuels),
 * sauf ceux qui ont prévenu de leur absence. Un billet en attente de paiement ne réserve pas de place.
 */
export async function placesTaken(sessionIds: number[]): Promise<Map<number, number>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ sessionId: attendances.sessionId, count: sql<number>`count(*)::int` })
    .from(attendances)
    .where(and(inArray(attendances.sessionId, sessionIds), ne(attendances.status, "declined")))
    .groupBy(attendances.sessionId);
  return new Map(rows.map((row) => [row.sessionId, row.count]));
}

/** Billets payés par séance (statistiques de l'administration). */
export async function ticketsSold(sessionIds: number[]): Promise<Map<number, number>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ sessionId: subscriptions.sessionId, count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.kind, "ticket"),
        inArray(subscriptions.sessionId, sessionIds),
        eq(subscriptions.paymentStatus, "paid"),
        ne(subscriptions.status, "cancelled"),
      ),
    )
    .groupBy(subscriptions.sessionId);
  return new Map(rows.map((row) => [row.sessionId!, row.count]));
}

/** Active un abonnement ou un billet après paiement et crée les présences correspondantes. */
export async function activateSubscription(subscriptionId: number): Promise<void> {
  const subscription = (
    await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1)
  )[0];
  if (!subscription) return;

  await db
    .update(subscriptions)
    .set({ status: "active", paymentStatus: "paid" })
    .where(eq(subscriptions.id, subscriptionId));

  await grantAttendances(subscription);

  const info = (
    await db
      .select({
        email: users.email,
        firstName: users.firstName,
        locale: users.locale,
        activity: activities,
        session: sessions,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .leftJoin(sessions, eq(sessions.id, subscriptions.sessionId))
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1)
  )[0];
  if (!info) return;

  const { locale } = info;
  const t = translatorFor(locale);
  const activityName = localize(info.activity, locale, ACTIVITY_TRANSLATABLE).name;

  if (subscription.kind === "ticket") {
    const place =
      info.session?.location || [info.activity.address, info.activity.city].filter(Boolean).join(", ") || null;
    await logAndSend({
      type: "ticket_confirmed",
      userId: subscription.userId,
      sessionId: info.session?.id ?? null,
      subscriptionId: subscription.id,
      recipient: info.email,
      locale,
      subject: t("emails.ticketConfirmed.subject", { activity: activityName }),
      body: [
        t("emails.hello", { name: info.firstName }),
        "",
        t("emails.ticketConfirmed.confirmed", { activity: activityName }),
        ...(info.session ? [t("emails.ticketConfirmed.date", { value: formatDateTime(info.session.startsAt, locale) })] : []),
        ...(place ? [t("emails.ticketConfirmed.place", { value: place })] : []),
        t("emails.ticketConfirmed.reference", { id: subscription.id }),
        "",
        t("emails.ticketConfirmed.follow"),
        `${appUrl()}/espace-personnel`,
        "",
        t("emails.team"),
      ].join("\n"),
    });
    return;
  }

  await logAndSend({
    type: "subscription_activated",
    userId: subscription.userId,
    subscriptionId: subscription.id,
    recipient: info.email,
    locale,
    subject: t("emails.subscriptionActivated.subject", { activity: activityName }),
    body: [
      t("emails.hello", { name: info.firstName }),
      "",
      t("emails.subscriptionActivated.active", { activity: activityName }),
      t("emails.subscriptionActivated.sessions", { count: subscription.sessionsIncluded }),
      t("emails.subscriptionActivated.validUntil", { date: formatDate(subscription.endsAt, locale) }),
      "",
      t("emails.subscriptionActivated.follow"),
      `${appUrl()}/espace-personnel`,
      "",
      t("emails.team"),
    ].join("\n"),
  });
}

/** Ajoute les participants abonnés lorsqu'une nouvelle séance est créée (les billets restent liés à leur date). */
export async function attachSubscribersToSession(sessionId: number, activityId: number): Promise<void> {
  const actives = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      sessionsIncluded: subscriptions.sessionsIncluded,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.activityId, activityId),
        eq(subscriptions.kind, "membership"),
        eq(subscriptions.status, "active"),
        gt(subscriptions.endsAt, new Date()),
      ),
    );

  if (actives.length === 0) return;

  await db
    .insert(attendances)
    .values(
      actives.map((subscription) => ({
        sessionId,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        status: "pending" as const,
        token: randomToken(),
      })),
    )
    .onConflictDoNothing();
}

/** Enregistre la réponse d'un participant (depuis l'e-mail ou la page de rappel). */
export async function respondToToken(
  token: string,
  response: "confirmed" | "declined",
  channel: "email" | "rappel" = "email",
): Promise<boolean> {
  const updated = await db
    .update(attendances)
    .set({ status: response, respondedAt: new Date(), responseChannel: channel })
    .where(eq(attendances.token, token))
    .returning({ id: attendances.id });
  return updated.length > 0;
}
