import { getLocale, getTranslations } from "next-intl/server";
import { runRemindersAction, toggleRuleAction, updateRuleAction } from "@/app/actions/admin";
import { getNotificationRules, getNotifications } from "@/lib/queries";
import { ATTENDANCE_STATUS, ATTENDANCE_STATUSES, formatDate, formatTime } from "@/lib/format";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

const NOTIFICATION_TYPES = [
  "reminder_48h",
  "account_created",
  "email_verification",
  "account_exists_notice",
  "subscription_activated",
  "session_cancelled",
  "subscription_ending",
] as const;
const isKnownType = (value: string): value is (typeof NOTIFICATION_TYPES)[number] =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

const NOTIFICATION_STATUSES = ["sent", "simulated", "failed", "queued"] as const;
const toNotificationStatus = (value: string) =>
  (NOTIFICATION_STATUSES as readonly string[]).includes(value) ? (value as (typeof NOTIFICATION_STATUSES)[number]) : "queued";

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const [locale, t, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.notifications"),
    getTranslations("status"),
  ]);
  const [rules, log] = await Promise.all([getNotificationRules(), getNotifications(50)]);

  const sent = log.filter((row) => row.notification.status === "sent").length;
  const simulated = log.filter((row) => row.notification.status === "simulated").length;
  const failed = log.filter((row) => row.notification.status === "failed").length;
  const typeLabel = (type: string) => (isKnownType(type) ? t(`types.${type}`) : type);

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-white">{t("engineTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {t.rich("engineText", {
              endpoint: (chunks) => (
                <code dir="ltr" className="rounded bg-black/40 px-1.5 py-0.5 text-xs text-amber-200">
                  {chunks}
                </code>
              ),
              header: (chunks) => (
                <code dir="ltr" className="text-xs">
                  {chunks}
                </code>
              ),
            })}
          </p>
        </div>
        <form action={runRemindersAction}>
          <button className="btn btn-primary btn-sm" type="submit">
            {t("runNow")}
          </button>
        </form>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("statRules")}
          value={rules.filter((rule) => rule.isEnabled).length}
          hint={t("statRulesHint", { count: rules.length })}
        />
        <Stat label={t("statSent")} value={sent} />
        <Stat label={t("statSimulated")} value={simulated} hint={t("statSimulatedHint")} />
        <Stat label={t("statFailed")} value={failed} />
      </section>

      <section>
        <SectionTitle eyebrow={t("rulesEyebrow")} title={t("rulesTitle")} />
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{rule.label}</p>
                  <p className="mt-1 text-xs text-zinc-400">{rule.description}</p>
                  <span className="badge mt-2 border-white/12 bg-white/5">
                    {typeLabel(rule.type)} · {rule.channel}
                    {rule.offsetHours > 0 ? t("offset", { days: Math.round(rule.offsetHours / 24) }) : t("immediate")}
                  </span>
                </div>
                <form action={toggleRuleAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="isEnabled" value={rule.isEnabled ? "false" : "true"} />
                  <button className={`btn btn-sm ${rule.isEnabled ? "btn-danger" : "btn-primary"}`} type="submit">
                    {rule.isEnabled ? t("disable") : t("enable")}
                  </button>
                </form>
              </div>
              <form action={updateRuleAction} className="mt-4 grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={rule.id} />
                <div className="sm:col-span-2">
                  <label className="label">{t("label")}</label>
                  <input name="label" maxLength={160} defaultValue={rule.label} className="input" />
                </div>
                <div>
                  <label className="label">{t("offsetHours")}</label>
                  <input name="offsetHours" type="number" min={0} defaultValue={rule.offsetHours} className="input" />
                </div>
                <div>
                  <label className="label">{t("channel")}</label>
                  <select name="channel" defaultValue={rule.channel} className="select">
                    <option value="email">{t("channelEmail")}</option>
                    <option value="sms">{t("channelSms")}</option>
                    <option value="whatsapp">{t("channelWhatsapp")}</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <button className="btn btn-ghost btn-sm" type="submit">
                    {t("updateRule")}
                  </button>
                </div>
              </form>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={t("logEyebrow")} title={t("logTitle")} />
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t("colDate")}</th>
                <th>{t("colType")}</th>
                <th>{t("colRecipient")}</th>
                <th>{t("colSubject")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colPreview")}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => {
                const status = toNotificationStatus(row.notification.status);
                return (
                  <tr key={row.notification.id}>
                    <td className="whitespace-nowrap text-zinc-400">
                      {formatDate(row.notification.createdAt, locale)}
                      <span className="block text-xs">{formatTime(row.notification.createdAt, locale)}</span>
                    </td>
                    <td>
                      <span className="badge border-white/12 bg-white/5">{typeLabel(row.notification.type)}</span>
                    </td>
                    <td className="text-zinc-300">
                      <span dir="ltr">{row.notification.recipient}</span>
                      {row.userName ? (
                        <span className="block text-xs text-zinc-500">
                          {row.userName} {row.userLastName}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[16rem] text-zinc-300">{row.notification.subject}</td>
                    <td>
                      <span
                        className={`badge ${
                          status === "failed"
                            ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                            : status === "sent"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        }`}
                        title={row.notification.error ?? undefined}
                      >
                        {tStatus(`notification.${status}`)}
                      </span>
                    </td>
                    <td className="max-w-[22rem] text-xs text-zinc-500">
                      <span className="line-clamp-3 whitespace-pre-line">{row.notification.body}</span>
                    </td>
                  </tr>
                );
              })}
              {log.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-zinc-500">
                    {t("empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Card>
        <h2 className="text-base font-bold text-white">{t("legend")}</h2>
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {ATTENDANCE_STATUSES.map((key) => (
            <li key={key} className={`badge ${ATTENDANCE_STATUS[key].className}`}>
              {ATTENDANCE_STATUS[key].dot} {tStatus(`attendance.${key}`)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
