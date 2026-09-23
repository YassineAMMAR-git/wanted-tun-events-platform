import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, SESSION_TRANSLATABLE, activities, attendances, sessions } from "@/db/schema";
import { respondToToken } from "@/lib/subscriptions";
import {
  ATTENDANCE_STATUS,
  formatDate,
  formatDuration,
  formatTime,
  isPast,
  toAttendanceStatus,
} from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReminderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fait?: string; erreur?: string }>;
}) {
  const { token } = await params;
  const { fait, erreur } = await searchParams;
  const [locale, t, tStatus] = await Promise.all([getLocale(), getTranslations("reminderPage"), getTranslations("status")]);

  const row = (
    await db
      .select({ attendance: attendances, session: sessions, activity: activities })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(attendances.token, token))
      .limit(1)
  )[0];

  if (!row) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <h1 className="text-2xl font-bold text-white">{t("invalidTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-400">{t("invalidText")}</p>
        </Card>
      </div>
    );
  }

  const { attendance } = row;
  const session = localize(row.session, locale, SESSION_TRANSLATABLE);
  const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
  const status = toAttendanceStatus(attendance.status);
  const cancelled = session.status !== "scheduled";
  const past = isPast(session.startsAt);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="text-center">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-black text-white">{activity.name}</h1>
      </div>

      {fait === "confirme" ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {t("confirmed")}
        </div>
      ) : null}
      {fait === "absent" ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {t("declined")}
        </div>
      ) : null}
      {erreur ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t("error")}
        </div>
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="badge border-white/12 bg-white/5">{session.title ?? t("session")}</span>
          <span className={`badge ${ATTENDANCE_STATUS[status].className}`}>
            {ATTENDANCE_STATUS[status].dot} {tStatus(`attendance.${status}`)}
          </span>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-white/6 pb-2">
            <dt className="text-zinc-500">{t("date")}</dt>
            <dd className="font-semibold text-zinc-100">{formatDate(session.startsAt, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/6 pb-2">
            <dt className="text-zinc-500">{t("time")}</dt>
            <dd className="font-semibold text-zinc-100">
              {formatTime(session.startsAt, locale)} · {formatDuration(session.durationMinutes, locale)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/6 pb-2">
            <dt className="text-zinc-500">{t("place")}</dt>
            <dd className="text-end font-semibold text-zinc-100">{session.location ?? activity.address}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("activity")}</dt>
            <dd className="text-end font-semibold text-zinc-100">{activity.name}</dd>
          </div>
        </dl>

        {cancelled ? (
          <p className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {session.status === "cancelled" ? t("cancelled") : t("postponed")}
          </p>
        ) : past ? (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/3 p-3 text-sm text-zinc-300">{t("past")}</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <form
              action={async () => {
                "use server";
                const done = await respondToToken(token, "confirmed", "rappel");
                redirect(`/rappel/${token}?${done ? "fait=confirme" : "erreur=1"}`);
              }}
            >
              <button className="btn btn-primary w-full" type="submit">
                {t("confirm")}
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                const done = await respondToToken(token, "declined", "rappel");
                redirect(`/rappel/${token}?${done ? "fait=absent" : "erreur=1"}`);
              }}
            >
              <button className="btn btn-danger w-full" type="submit">
                {t("decline")}
              </button>
            </form>
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-zinc-500">{t("footer")}</p>
    </div>
  );
}
