import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, activities, attendances, sessions, subscriptions, users } from "@/db/schema";
import { randomToken } from "@/lib/auth";
import { appUrl, logAndSend } from "@/lib/mailer";
import { formatDate } from "@/lib/format";
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

/** Active un abonnement après paiement et génère les séances suivies. */
export async function activateSubscription(subscriptionId: number): Promise<void> {
  const subscription = (
    await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1)
  )[0];
  if (!subscription) return;

  await db
    .update(subscriptions)
    .set({ status: "active", paymentStatus: "paid" })
    .where(eq(subscriptions.id, subscriptionId));

  await ensureAttendances({
    userId: subscription.userId,
    activityId: subscription.activityId,
    subscriptionId: subscription.id,
    limit: subscription.sessionsIncluded,
  });

  const info = (
    await db
      .select({ email: users.email, firstName: users.firstName, locale: users.locale, activity: activities })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1)
  )[0];

  if (info) {
    const { locale } = info;
    const t = translatorFor(locale);
    const activityName = localize(info.activity, locale, ACTIVITY_TRANSLATABLE).name;
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
}

/** Ajoute les participants abonnés lorsqu'une nouvelle séance est créée. */
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
