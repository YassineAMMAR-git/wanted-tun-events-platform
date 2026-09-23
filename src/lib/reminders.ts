import "server-only";
import { and, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  activities,
  attendances,
  notificationRules,
  notifications,
  sessions,
  subscriptions,
  users,
} from "@/db/schema";
import { appUrl, logAndSend } from "@/lib/mailer";
import { formatDate, formatTime, formatDuration } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { translatorFor } from "@/i18n/translator";

export type ReminderJobResult = {
  remindersSent: number;
  subscriptionsExpired: number;
  sessionsProcessed: number[];
  dryRun: boolean;
};

/**
 * Rappel automatique J-2 (48h avant la séance).
 * Idempotent : une séance ne reçoit qu'une seule vague de rappels.
 */
export async function runReminderJob(): Promise<ReminderJobResult> {
  const now = new Date();

  const expired = await db
    .update(subscriptions)
    .set({ status: "expired" })
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.endsAt, now)))
    .returning({ id: subscriptions.id });

  const rule = (
    await db
      .select()
      .from(notificationRules)
      .where(and(eq(notificationRules.type, "reminder_48h"), eq(notificationRules.isEnabled, true)))
      .limit(1)
  )[0];

  if (!rule) {
    return { remindersSent: 0, subscriptionsExpired: expired.length, sessionsProcessed: [], dryRun: false };
  }

  const horizon = new Date(now.getTime() + rule.offsetHours * 60 * 60 * 1000);

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
        gt(sessions.startsAt, now),
        lte(sessions.startsAt, horizon),
      ),
    );

  if (upcoming.length === 0) {
    return { remindersSent: 0, subscriptionsExpired: expired.length, sessionsProcessed: [], dryRun: false };
  }

  const sessionIds = upcoming.map((session) => session.id);

  /*
   * Idempotence au participant près : on ne retient que les rappels réellement partis.
   * Un envoi en échec (Resend indisponible, clé absente…) reste donc à retenter au passage
   * suivant du cron, sans renvoyer d'e-mail à ceux qui l'ont déjà reçu.
   */
  const alreadyNotified = await db
    .select({ sessionId: notifications.sessionId, userId: notifications.userId })
    .from(notifications)
    .where(
      and(
        inArray(notifications.sessionId, sessionIds),
        eq(notifications.type, "reminder_48h"),
        ne(notifications.status, "failed"),
      ),
    );
  const notifiedPairs = new Set(alreadyNotified.map((row) => `${row.sessionId}:${row.userId}`));

  let sent = 0;
  const processed: number[] = [];
  for (const session of upcoming) {
    const participants = await db
      .select({
        attendanceId: attendances.id,
        status: attendances.status,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        locale: users.locale,
        userId: users.id,
        token: attendances.token,
      })
      .from(attendances)
      .innerJoin(users, eq(users.id, attendances.userId))
      .where(eq(attendances.sessionId, session.id));

    const base = appUrl();
    for (const participant of participants) {
      if (participant.status === "declined") continue;
      if (notifiedPairs.has(`${session.id}:${participant.userId}`)) continue;
      const confirmUrl = `${base}/api/rappel/${participant.token}?reponse=confirme`;
      const declineUrl = `${base}/api/rappel/${participant.token}?reponse=absent`;
      const address = session.location ?? `${session.activity.address ?? ""} ${session.activity.city ?? ""}`.trim();
      const { locale } = participant;
      const t = translatorFor(locale);
      const activityName = localize(session.activity, locale, ACTIVITY_TRANSLATABLE).name;
      const date = formatDate(session.startsAt, locale);

      await logAndSend({
        type: "reminder_48h",
        channel: rule.channel,
        userId: participant.userId,
        sessionId: session.id,
        recipient: participant.email,
        locale,
        subject: t("emails.reminder.subject", { activity: activityName, date }),
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
          t("emails.signature"),
          t("emails.team"),
        ].join("\n"),
      });
      sent += 1;
      if (processed.at(-1) !== session.id) processed.push(session.id);
    }
  }

  return {
    remindersSent: sent,
    subscriptionsExpired: expired.length,
    sessionsProcessed: processed,
    dryRun: false,
  };
}
