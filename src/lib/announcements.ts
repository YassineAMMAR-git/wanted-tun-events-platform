import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, SESSION_TRANSLATABLE, activities, sessions, users } from "@/db/schema";
import { appUrl, logAndSend } from "@/lib/mailer";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { translatorFor } from "@/i18n/translator";

/*
 * Annonce d'une nouvelle séance ou date à tous les clients, au choix de l'administration à la création.
 * Prospection auprès de clients existants (art. L34-5 CPCE) : chaque e-mail porte un lien de désinscription,
 * et un client désinscrit n'en reçoit plus.
 */

/** Écart entre deux envois : Resend accepte au plus 2 envois par seconde. */
const SEND_INTERVAL_MS = 600;

/** Clients qui reçoivent les annonces : compte confirmé, pas désinscrits. */
const recipientsFilter = () =>
  and(eq(users.role, "client"), isNotNull(users.emailVerifiedAt), eq(users.announcementsOptOut, false));

export async function announcementRecipientsCount(): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(recipientsFilter());
  return count;
}

/** Lien de désinscription d'un client. */
export const unsubscribeUrl = (token: string) => `${appUrl()}/desinscription/${token}`;

/**
 * Envoie l'annonce de la séance à tous les clients concernés, chacun dans sa langue.
 * Appelée après la réponse à l'administration (envoi en arrière-plan) : chaque envoi est journalisé.
 */
export async function announceNewSession(sessionId: number): Promise<{ sent: number; failed: number }> {
  const row = (
    await db
      .select({ session: sessions, activity: activities })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
  )[0];
  // Activité masquée, séance arrêtée ou passée : rien à annoncer.
  if (!row || row.activity.status !== "active" || row.session.status !== "scheduled") return { sent: 0, failed: 0 };
  if (row.session.startsAt.getTime() <= Date.now()) return { sent: 0, failed: 0 };

  // Jeton de désinscription des clients qui n'en ont pas encore.
  await db
    .update(users)
    .set({ unsubscribeToken: sql`gen_random_uuid()::text` })
    .where(and(eq(users.role, "client"), isNull(users.unsubscribeToken)));

  const recipients = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      locale: users.locale,
      token: users.unsubscribeToken,
    })
    .from(users)
    .where(recipientsFilter());

  let sent = 0;
  let failed = 0;
  for (const [index, recipient] of recipients.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
    const { locale } = recipient;
    const t = translatorFor(locale);
    const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
    const session = localize(row.session, locale, SESSION_TRANSLATABLE);
    const place = session.location || [activity.address, activity.city].filter(Boolean).join(", ");
    try {
      const result = await logAndSend({
        type: "session_announcement",
        userId: recipient.id,
        sessionId: row.session.id,
        recipient: recipient.email,
        locale,
        subject: t("emails.sessionAnnouncement.subject", { activity: activity.name }),
        body: [
          t("emails.hello", { name: recipient.firstName }),
          "",
          t("emails.sessionAnnouncement.intro", { activity: activity.name }),
          "",
          ...(session.title ? [t("emails.sessionAnnouncement.title", { value: session.title })] : []),
          t("emails.reminder.date", { value: formatDate(row.session.startsAt, locale) }),
          t("emails.reminder.time", {
            time: formatTime(row.session.startsAt, locale),
            duration: formatDuration(row.session.durationMinutes, locale),
          }),
          t("emails.reminder.place", { value: place || t("emails.reminder.placeTbc") }),
          ...(session.notes ? [t("emails.sessionChanged.info", { notes: session.notes })] : []),
          "",
          t("emails.sessionAnnouncement.book"),
          `${appUrl()}/activites/${row.activity.slug}`,
          "",
          t("emails.team"),
          "",
          t("emails.sessionAnnouncement.unsubscribe"),
          unsubscribeUrl(recipient.token ?? ""),
        ].join("\n"),
      });
      if (result.status === "failed") failed += 1;
      else sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`[annonce] envoi impossible → ${recipient.email}`, error);
    }
  }
  return { sent, failed };
}
