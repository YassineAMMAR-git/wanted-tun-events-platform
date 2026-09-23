import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, ne } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, activities, attendances, sessions, users } from "@/db/schema";
import {
  addParticipantAction,
  removeParticipantAction,
  setAttendanceStatusAction,
  setSessionStatusAction,
  updateSessionAction,
} from "@/app/actions/admin";
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUSES,
  formatDate,
  formatDateTime,
  formatDuration,
  toAttendanceStatus,
  toDateTimeLocalValue,
} from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";

export const dynamic = "force-dynamic";

const RESPONSE_CHANNELS = ["email", "espace-personnel", "administration"] as const;
const toChannel = (value: string | null) =>
  (RESPONSE_CHANNELS as readonly string[]).includes(value ?? "") ? (value as (typeof RESPONSE_CHANNELS)[number]) : "email";

export default async function AdminSessionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const { ok, erreur } = await searchParams;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) notFound();

  const [locale, t, tActivity, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.sessionDetail"),
    getTranslations("admin.activityDetail"),
    getTranslations("common"),
    getTranslations("status"),
  ]);

  const row = (
    await db
      .select({ session: sessions, activity: activities })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
  )[0];
  if (!row) notFound();
  const { session } = row;
  const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);

  const [participants, clients] = await Promise.all([
    db
      .select({ attendance: attendances, user: users })
      .from(attendances)
      .innerJoin(users, eq(users.id, attendances.userId))
      .where(eq(attendances.sessionId, sessionId))
      .orderBy(asc(users.lastName)),
    db.select().from(users).where(ne(users.role, "admin")).orderBy(asc(users.lastName)),
  ]);

  const confirmed = participants.filter((p) => p.attendance.status === "confirmed").length;
  const declined = participants.filter((p) => p.attendance.status === "declined").length;
  const pending = participants.length - confirmed - declined;
  const already = new Set(participants.map((p) => p.user.id));
  const backTo = `/admin/seances/${session.id}`;

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <nav className="text-sm text-zinc-500">
        <Link href="/admin/seances" className="hover:text-amber-300">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">{session.title ?? activity.name}</span>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("statParticipants")} value={participants.length} />
        <Stat label={t("statConfirmed")} value={confirmed} />
        <Stat label={t("statPending")} value={Math.max(pending, 0)} />
        <Stat label={t("statDeclined")} value={declined} />
      </section>

      <Card>
        <h2 className="text-lg font-bold text-white">{t("title")}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {t("summary", {
            activity: activity.name,
            date: formatDateTime(session.startsAt, locale),
            duration: formatDuration(session.durationMinutes, locale),
            place: session.location ?? activity.address ?? tCommon("none"),
          })}
        </p>
        <form action={updateSessionAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="activityId" value={row.activity.id} />
          <input type="hidden" name="redirectTo" value="session" />
          <div className="sm:col-span-2 lg:col-span-4">
            <TranslationFields
              gridClassName="grid gap-3 sm:grid-cols-2"
              values={{ title: session.title, notes: session.notes }}
              translations={session.translations}
              fields={[
                { name: "title", label: tActivity("title"), maxLength: 180 },
                { name: "notes", label: t("notes"), maxLength: 2000 },
              ]}
            />
          </div>
          <div>
            <label className="label">{tActivity("dateTime")}</label>
            <input name="startsAt" type="datetime-local" defaultValue={toDateTimeLocalValue(session.startsAt)} className="input" />
          </div>
          <div>
            <label className="label">{tActivity("durationShort")}</label>
            <input name="durationMinutes" type="number" min={15} defaultValue={session.durationMinutes} className="input" />
          </div>
          <div>
            <label className="label">{tActivity("status")}</label>
            <select name="status" defaultValue={session.status} className="select">
              <option value="scheduled">{tStatus("session.scheduled")}</option>
              <option value="cancelled">{tStatus("session.cancelled")}</option>
              <option value="postponed">{tStatus("session.postponed")}</option>
            </select>
          </div>
          <div>
            <label className="label">{tActivity("location")}</label>
            <input name="location" maxLength={240} defaultValue={session.location ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button className="btn btn-primary btn-sm" type="submit">
              {t("save")}
            </button>
          </div>
        </form>

        {session.status === "scheduled" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={setSessionStatusAction}>
              <input type="hidden" name="id" value={session.id} />
              <input type="hidden" name="status" value="postponed" />
              <input type="hidden" name="redirectTo" value={backTo} />
              <button className="btn btn-ghost btn-sm" type="submit">
                {tActivity("postpone")}
              </button>
            </form>
            <form action={setSessionStatusAction}>
              <input type="hidden" name="id" value={session.id} />
              <input type="hidden" name="status" value="cancelled" />
              <input type="hidden" name="redirectTo" value={backTo} />
              <button className="btn btn-danger btn-sm" type="submit">
                {t("cancelWithEmail")}
              </button>
            </form>
          </div>
        ) : null}
      </Card>

      <section>
        <SectionTitle eyebrow={t("participantsEyebrow")} title={t("participantsTitle")} subtitle={t("participantsSubtitle")} />

        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("colParticipant")}</th>
                <th>{t("colContact")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colResponse")}</th>
                <th>{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => {
                const status = toAttendanceStatus(participant.attendance.status);
                return (
                  <tr key={participant.attendance.id}>
                    <td>
                      <Link href={`/admin/clients/${participant.user.id}`} className="font-semibold text-white hover:text-amber-300">
                        {participant.user.firstName} {participant.user.lastName}
                      </Link>
                    </td>
                    <td className="text-zinc-400">
                      <span dir="ltr">{participant.user.email}</span>
                      {participant.user.phone ? (
                        <span className="block text-xs" dir="ltr">
                          {participant.user.phone}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${ATTENDANCE_STATUS[status].className}`}>
                        {ATTENDANCE_STATUS[status].dot} {tStatus(`attendance.${status}`)}
                      </span>
                    </td>
                    <td className="text-xs text-zinc-500">
                      {participant.attendance.respondedAt
                        ? `${formatDate(participant.attendance.respondedAt, locale)} · ${tStatus(
                            `channel.${toChannel(participant.attendance.responseChannel)}`,
                          )}`
                        : tCommon("none")}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {ATTENDANCE_STATUSES.map((next) => (
                          <form key={next} action={setAttendanceStatusAction}>
                            <input type="hidden" name="id" value={participant.attendance.id} />
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="status" value={next} />
                            <button
                              className={`btn btn-sm ${participant.attendance.status === next ? "btn-primary" : "btn-ghost"}`}
                              type="submit"
                              title={tStatus(`attendance.${next}`)}
                              aria-label={tStatus(`attendance.${next}`)}
                            >
                              {ATTENDANCE_STATUS[next].dot}
                            </button>
                          </form>
                        ))}
                        <form action={removeParticipantAction}>
                          <input type="hidden" name="id" value={participant.attendance.id} />
                          <input type="hidden" name="sessionId" value={session.id} />
                          <button className="btn btn-danger btn-sm" type="submit">
                            {t("remove")}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-zinc-500">
                    {t("empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Card className="mt-5">
          <h3 className="text-base font-bold text-white">{t("addTitle")}</h3>
          <form action={addParticipantAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="sessionId" value={session.id} />
            <div className="flex-1">
              <label className="label" htmlFor="userId">
                {t("client")}
              </label>
              <select id="userId" name="userId" className="select" required>
                {clients.map((client) => (
                  <option key={client.id} value={client.id} disabled={already.has(client.id)}>
                    {client.firstName} {client.lastName} — {client.email}
                    {already.has(client.id) ? t("alreadyRegistered") : ""}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              {tCommon("add")}
            </button>
          </form>
        </Card>
      </section>
    </div>
  );
}
