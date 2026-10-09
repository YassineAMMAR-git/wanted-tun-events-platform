import "server-only";
import { and, asc, eq, gt, inArray, like, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  activities,
  attendances,
  notificationRules,
  notifications,
  sessions,
  users,
} from "@/db/schema";
import { CONFIRMATION_CLOSE_HOURS, confirmationDeadline } from "@/lib/attendance";
import { appUrl, logAndSend } from "@/lib/mailer";
import { formatDate, formatDateTime, formatTime, formatDuration } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { closeConfirmations, expireSubscriptions } from "@/lib/subscriptions";
import { translatorFor } from "@/i18n/translator";

export type ReminderJobResult = {
  remindersSent: number;
  subscriptionsExpired: number;
  attendancesClosed: number;
  sessionsProcessed: number[];
  dryRun: boolean;
};

/** Rappels de confirmation : 5, 4 puis 3 jours avant la séance. Les présences sont clôturées 2 jours avant. */
export const REMINDER_RULES = [
  { type: "reminder_j5", days: 5 },
  { type: "reminder_j4", days: 4 },
  { type: "reminder_j3", days: 3 },
] as const;
const REMINDER_PREFIX = "reminder_j";

/**
 * Installe les trois règles de rappel si elles manquent (base créée avant ce fonctionnement)
 * et retire l'ancien rappel unique « 48 h avant ». Sans effet si tout est déjà en place.
 */
export async function ensureReminderRules(): Promise<void> {
  await db
    .insert(notificationRules)
    .values(
      REMINDER_RULES.map((rule) => ({
        type: rule.type,
        label: `Rappel de confirmation J-${rule.days}`,
        description: `E-mail envoyé ${rule.days} jours avant la séance aux participants qui n'ont pas encore confirmé leur présence, avec la date limite de confirmation (${CONFIRMATION_CLOSE_HOURS} h avant la séance).`,
        offsetHours: rule.days * 24,
        channel: "email",
        isEnabled: true,
      })),
    )
    .onConflictDoNothing({ target: notificationRules.type });
  await db.delete(notificationRules).where(eq(notificationRules.type, "reminder_48h"));
}

/**
 * Tâche quotidienne :
 *  1. termine les abonnements dont toutes les séances ont eu lieu, et les billets dont la date est passée ;
 *  2. clôture les présences des séances qui commencent dans moins de 48 h (non confirmé = absent) ;
 *  3. envoie les rappels de confirmation (J-5, J-4, J-3) aux participants qui n'ont pas encore confirmé.
 *
 * Idempotent : chaque participant reçoit au plus un e-mail par rappel et par séance.
 */
export async function runReminderJob(): Promise<ReminderJobResult> {
  const now = new Date();

  const subscriptionsExpired = await expireSubscriptions();

  const attendancesClosed = await closeConfirmations();

  await ensureReminderRules();
  const rules = await db
    .select()
    .from(notificationRules)
    .where(and(like(notificationRules.type, `${REMINDER_PREFIX}%`), eq(notificationRules.isEnabled, true)))
    .orderBy(asc(notificationRules.offsetHours));
  // Un rappel n'a de sens que tant que la confirmation est encore possible.
  const activeRules = rules.filter((rule) => rule.offsetHours > CONFIRMATION_CLOSE_HOURS);

  const result = (remindersSent: number, sessionsProcessed: number[]): ReminderJobResult => ({
    remindersSent,
    subscriptionsExpired,
    attendancesClosed,
    sessionsProcessed,
    dryRun: false,
  });
  if (activeRules.length === 0) return result(0, []);

  const hour = 60 * 60 * 1000;
  const horizon = new Date(now.getTime() + activeRules.at(-1)!.offsetHours * hour);
  const upcoming = await db
    .select({
      id: sessions.id,
      startsAt: sessions.startsAt,
      durationMinutes: sessions.durationMinutes,
      location: sessions.location,
      activity: activities,
    })
    .from(sessions)
    .innerJoin(activities, eq(activities.id, sessions.activityId))
    .where(
      and(
        eq(sessions.status, "scheduled"),
        gt(sessions.startsAt, new Date(now.getTime() + CONFIRMATION_CLOSE_HOURS * hour)),
        lte(sessions.startsAt, horizon),
      ),
    );
  if (upcoming.length === 0) return result(0, []);

  /*
   * Idempotence au participant près : on ne retient que les rappels réellement partis.
   * Un envoi en échec reste donc à retenter au passage suivant, sans renvoyer d'e-mail à ceux qui l'ont reçu.
   */
  const alreadyNotified = await db
    .select({ type: notifications.type, sessionId: notifications.sessionId, userId: notifications.userId })
    .from(notifications)
    .where(
      and(
        inArray(
          notifications.sessionId,
          upcoming.map((session) => session.id),
        ),
        like(notifications.type, `${REMINDER_PREFIX}%`),
        ne(notifications.status, "failed"),
      ),
    );
  const notified = new Set(alreadyNotified.map((row) => `${row.type}:${row.sessionId}:${row.userId}`));

  const base = appUrl();
  let sent = 0;
  const processed: number[] = [];
  for (const session of upcoming) {
    // Rappel en cours : le plus proche de la séance parmi ceux dont l'échéance est atteinte (J-5, puis J-4, puis J-3).
    const hoursLeft = (session.startsAt.getTime() - now.getTime()) / hour;
    const rule = activeRules.find((candidate) => candidate.offsetHours >= hoursLeft);
    if (!rule) continue;
    const lastCall = rule.id === activeRules[0]!.id;

    // Seuls ceux qui n'ont ni confirmé ni signalé leur absence sont relancés.
    const participants = await db
      .select({
        firstName: users.firstName,
        email: users.email,
        locale: users.locale,
        userId: users.id,
        token: attendances.token,
      })
      .from(attendances)
      .innerJoin(users, eq(users.id, attendances.userId))
      .where(and(eq(attendances.sessionId, session.id), eq(attendances.status, "pending")));

    for (const participant of participants) {
      if (notified.has(`${rule.type}:${session.id}:${participant.userId}`)) continue;
      const confirmUrl = `${base}/api/rappel/${participant.token}?reponse=confirme`;
      const declineUrl = `${base}/api/rappel/${participant.token}?reponse=absent`;
      const address = session.location ?? `${session.activity.address ?? ""} ${session.activity.city ?? ""}`.trim();
      const { locale } = participant;
      const t = translatorFor(locale);
      const activityName = localize(session.activity, locale, ACTIVITY_TRANSLATABLE).name;
      const date = formatDate(session.startsAt, locale);

      await logAndSend({
        type: rule.type,
        channel: rule.channel,
        userId: participant.userId,
        sessionId: session.id,
        recipient: participant.email,
        locale,
        subject: lastCall
          ? t("emails.reminder.subjectLast", { activity: activityName, date })
          : t("emails.reminder.subject", { activity: activityName, date }),
        body: [
          t("emails.hello", { name: participant.firstName }),
          "",
          t("emails.reminder.intro"),
          t("emails.reminder.activity", { value: activityName }),
          t("emails.reminder.date", { value: date }),
          t("emails.reminder.time", {
            time: formatTime(session.startsAt, locale),
            duration: formatDuration(session.durationMinutes, locale),
          }),
          t("emails.reminder.place", { value: address || t("emails.reminder.placeTbc") }),
          "",
          t("emails.reminder.askConfirm"),
          t("emails.reminder.confirm", { url: confirmUrl }),
          t("emails.reminder.decline", { url: declineUrl }),
          "",
          t("emails.reminder.deadline", {
            deadline: formatDateTime(confirmationDeadline(session.startsAt), locale),
            hours: CONFIRMATION_CLOSE_HOURS,
          }),
          ...(lastCall ? [t("emails.reminder.lastCall")] : []),
          "",
          t("emails.signature"),
          t("emails.team"),
        ].join("\n"),
      });
      sent += 1;
      if (processed.at(-1) !== session.id) processed.push(session.id);
    }
  }

  return result(sent, processed);
}
