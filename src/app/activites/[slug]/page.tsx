import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getActivityDetail } from "@/lib/queries";
import { subscribeAction } from "@/app/actions/booking";
import { formatDate, formatDuration, formatPrice, formatTime } from "@/lib/format";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSeeded();
  const { slug } = await params;
  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("activity"), getTranslations("common")]);
  const detail = await getActivityDetail(slug, locale);
  if (!detail) notFound();

  const { activity, categoryName, categoryEmoji, plans, upcoming, past } = detail;
  const address = [activity.address, activity.city].filter(Boolean).join(", ");

  return (
    <div className="space-y-10">
      <nav className="text-sm text-zinc-500">
        <Link href="/activites" className="hover:text-amber-300">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <Link href={`/activites?categorie=${detail.categorySlug}`} className="hover:text-amber-300">
          {categoryName}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">{activity.name}</span>
      </nav>

      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-35"
          style={{ backgroundImage: activity.imageUrl ? `url('${activity.imageUrl}')` : undefined }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0d] via-[#0b0b0d]/90 to-transparent rtl:bg-gradient-to-l" />
        <div className="relative max-w-2xl p-7 sm:p-10">
          <span className="badge border-amber-300/30 bg-amber-300/10 text-amber-200">
            {categoryEmoji} {categoryName}
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">{activity.name}</h1>
          <p className="mt-3 text-base text-zinc-300">{activity.shortDescription}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {[
              `📍 ${address}`,
              `🕒 ${activity.scheduleText ?? tCommon("none")}`,
              `⏱️ ${formatDuration(activity.durationMinutes, locale)}`,
              `👥 ${t("places", { count: activity.capacity })}`,
              `🎟️ ${formatPrice(activity.priceCents, locale)}`,
            ].map((chip) => (
              <span key={chip} className="badge border-white/12 bg-black/45 text-zinc-200">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="text-lg font-bold text-white">{t("description")}</h2>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-zinc-300">{activity.description}</p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-white">{t("practical")}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {[
              [t("category"), categoryName],
              [t("address"), address],
              [t("schedule"), activity.scheduleText ?? tCommon("none")],
              [t("sessionDuration"), formatDuration(activity.durationMinutes, locale)],
              [t("pricePerSession"), formatPrice(activity.priceCents, locale)],
              [t("plans"), tCommon("plansCount", { count: plans.length })],
              [t("upcomingCount"), String(upcoming.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-white/6 pb-2">
                <dt className="text-zinc-500">{label}</dt>
                <dd className="text-end font-medium text-zinc-200">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section>
        <SectionTitle eyebrow={t("plansEyebrow")} title={t("plansTitle")} subtitle={t("plansSubtitle")} />
        {plans.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-400">{t("noPlans")}</p>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="card card-hover flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-white">{plan.name}</h3>
                  <span className="badge border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    {tCommon("sessions", { count: plan.sessionsIncluded })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{plan.description}</p>
                <p className="mt-4 text-3xl font-black text-amber-300">{formatPrice(plan.priceCents, locale)}</p>
                <p className="text-xs text-zinc-500">
                  {t("perSession", {
                    price: formatPrice(Math.round(plan.priceCents / Math.max(plan.sessionsIncluded, 1)), locale),
                  })}
                </p>

                <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
                  <li>📍 {plan.address ?? address}</li>
                  <li>🕒 {plan.scheduleText ?? activity.scheduleText}</li>
                  <li>{t("validity", { days: tCommon("days", { count: plan.validityDays }) })}</li>
                  <li>{t("included", { count: plan.sessionsIncluded })}</li>
                </ul>
                {plan.extraInfo ? (
                  <p className="mt-3 rounded-xl border border-white/8 bg-white/3 p-3 text-xs text-zinc-400">
                    ℹ️ {plan.extraInfo}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-col gap-2">
                  <form action={subscribeAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <button className="btn btn-primary w-full" type="submit">
                      {t("choose", { price: formatPrice(plan.priceCents, locale) })}
                    </button>
                  </form>
                  <p className="text-center text-[11px] text-zinc-500">{t("securePayment")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-white">{t("upcomingTitle")}</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">{t("noUpcoming")}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {upcoming.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{session.title ?? activity.name}</p>
                    <p className="text-xs text-zinc-400">{session.location ?? address}</p>
                  </div>
                  <div className="text-end text-xs text-zinc-300">
                    <p className="font-semibold text-emerald-300">🟢 {formatDate(session.startsAt, locale)}</p>
                    <p>
                      {formatTime(session.startsAt, locale)} · {formatDuration(session.durationMinutes, locale)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-white">{t("pastTitle")}</h2>
          {past.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">{t("noPast")}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {past.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/2 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-300">{session.title ?? activity.name}</p>
                    <p className="text-xs text-zinc-500">{session.location ?? address}</p>
                  </div>
                  <p className="text-xs text-zinc-500">⚪ {formatDate(session.startsAt, locale)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
