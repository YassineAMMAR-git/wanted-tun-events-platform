import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getActivityDetail } from "@/lib/queries";
import { buyTicketAction, subscribeAction } from "@/app/actions/booking";
import { formatDate, formatDuration, formatPrice, formatTime, parseParisDateTime, toDateTimeLocalValue } from "@/lib/format";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ du?: string; au?: string; lieu?: string; billet?: string }>;
}) {
  await ensureSeeded();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("activity"), getTranslations("common")]);

  // Dates saisies en heure de Paris : du début du premier jour à la fin du dernier.
  const du = query.du && DAY.test(query.du) ? query.du : undefined;
  const au = query.au && DAY.test(query.au) ? query.au : undefined;
  const lieu = query.lieu?.trim().slice(0, 240) || undefined;
  const detail = await getActivityDetail(slug, locale, {
    from: du ? parseParisDateTime(`${du}T00:00`) : null,
    to: au ? parseParisDateTime(`${au}T23:59`) : null,
    place: lieu,
  });
  if (!detail) notFound();

  const { activity, categoryName, categoryEmoji, plans, upcoming, past, upcomingTotal, upcomingPlaces } = detail;
  const filtered = Boolean(du || au || lieu);
  const today = toDateTimeLocalValue(new Date()).slice(0, 10);
  const pagePath = `/activites/${activity.slug}`;
  const address = [activity.address, activity.city].filter(Boolean).join(", ");
  const { ticketDates, sessionSales } = detail;
  const nextDate = ticketDates[0];
  const firstAvailable = ticketDates.find((date) => date.placesLeft > 0);
  const free = activity.priceCents <= 0;
  const ticketNotice =
    query.billet === "complet" ? t("ticketSoldOut") : query.billet === "indisponible" ? t("ticketUnavailable") : null;
  // Événement terminé : on affiche la date à laquelle il a eu lieu.
  const { finished } = detail;
  const shownDate = nextDate ?? (finished ? past[0] : undefined);
  const nextDateLabel = shownDate
    ? tCommon("dateAtTime", { date: formatDate(shownDate.startsAt, locale), time: formatTime(shownDate.startsAt, locale) })
    : t("dateTba");
  const ticketPrice = free ? t("free") : formatPrice(activity.priceCents, locale);

  return (
    <div className="space-y-8">
      <nav className="text-sm text-zinc-500">
        <Link href="/activites" className="hover:text-gold-dark">
          {t("breadcrumb")}
        </Link>
        <span className="px-2">/</span>
        <Link href={`/activites?categorie=${detail.categorySlug}`} className="hover:text-gold-dark">
          {categoryName}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-700">{activity.name}</span>
      </nav>

      <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: activity.imageUrl ? `url('${activity.imageUrl}')` : undefined }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/20 rtl:bg-gradient-to-l" />
        <div className="relative max-w-2xl p-5 sm:p-7">
          <span className="badge border-amber-200 bg-amber-50 text-gold-dark">
            {categoryEmoji} {categoryName}
          </span>
          {finished ? <span className="badge ms-2 border-zinc-300 bg-zinc-100 text-zinc-700">⚪ {t("finished")}</span> : null}
          <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">{activity.name}</h1>
          <p className="mt-2 text-sm text-zinc-700 sm:text-base">{activity.shortDescription}</p>
          <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
            {(detail.offersMemberships
              ? [
                  `📍 ${address}`,
                  `🕒 ${activity.scheduleText ?? tCommon("none")}`,
                  `⏱️ ${formatDuration(activity.durationMinutes, locale)}`,
                  `👥 ${t("places", { count: activity.capacity })}`,
                  `🎟️ ${formatPrice(activity.priceCents, locale)}`,
                ]
              : [
                  `📅 ${nextDateLabel}`,
                  `📍 ${nextDate?.location || address}`,
                  `⏱️ ${formatDuration(nextDate?.durationMinutes ?? activity.durationMinutes, locale)}`,
                  `🎟️ ${ticketPrice}`,
                ]
            ).map((chip) => (
              <span key={chip} className="badge border-zinc-300 bg-white/90 text-zinc-800">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="text-lg font-bold text-zinc-900">{t("description")}</h2>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-zinc-700">{activity.description}</p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-zinc-900">{t("practical")}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {(detail.offersMemberships
              ? [
                  [t("category"), categoryName],
                  [t("address"), address],
                  [t("schedule"), activity.scheduleText ?? tCommon("none")],
                  [t("sessionDuration"), formatDuration(activity.durationMinutes, locale)],
                  [t("pricePerSession"), formatPrice(activity.priceCents, locale)],
                  [t("plans"), tCommon("plansCount", { count: plans.length })],
                  [t("upcomingCount"), String(upcomingTotal)],
                ]
              : [
                  [t("category"), categoryName],
                  [t("address"), nextDate?.location || address],
                  [t("eventDate"), nextDateLabel],
                  ...(activity.scheduleText ? [[t("schedule"), activity.scheduleText]] : []),
                  [t("eventDuration"), formatDuration(nextDate?.durationMinutes ?? activity.durationMinutes, locale)],
                  [t("ticketPrice"), ticketPrice],
                ]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-zinc-200 pb-2">
                <dt className="text-zinc-500">{label}</dt>
                <dd className="text-end font-medium text-zinc-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      {detail.offersMemberships ? null : (
        <section id="billet" className="scroll-mt-20">
          <SectionTitle eyebrow={t("ticketEyebrow")} title={t("ticketTitle")} subtitle={t("ticketSubtitle")} />
          {ticketNotice ? (
            <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
              {ticketNotice}
            </div>
          ) : null}
          <Card className="max-w-2xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs tracking-wider text-zinc-500 uppercase">{t("ticketPrice")}</p>
                <p className="text-3xl font-black text-gold-dark">{ticketPrice}</p>
              </div>
              <p className="text-sm text-zinc-600">{t("ticketPerPerson")}</p>
            </div>

            {ticketDates.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">
                {finished ? t("eventOver", { date: nextDateLabel }) : t("noDates")}
              </p>
            ) : (
              <form action={buyTicketAction} className="mt-4 space-y-3">
                <fieldset className="space-y-2">
                  <legend className="label">{ticketDates.length > 1 ? t("chooseDate") : t("eventDate")}</legend>
                  {ticketDates.map((date) => {
                    const full = date.placesLeft === 0;
                    return (
                      <label
                        key={date.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          full
                            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60"
                            : "cursor-pointer border-amber-200 bg-amber-50/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="sessionId"
                          value={date.id}
                          required
                          disabled={full}
                          defaultChecked={date.id === firstAvailable?.id}
                          className="accent-amber-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-zinc-900">
                            📅 {formatDate(date.startsAt, locale)} · {formatTime(date.startsAt, locale)}
                          </span>
                          <span className="block truncate text-xs text-zinc-600">
                            📍 {date.location || address}
                            {date.title ? ` · ${date.title}` : ""}
                          </span>
                        </span>
                        <span
                          className={`badge ${
                            full ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {full ? t("soldOut") : t("placesLeft", { count: date.placesLeft })}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <button className="btn btn-primary w-full" type="submit" disabled={!firstAvailable}>
                  {!firstAvailable
                    ? t("soldOut")
                    : free
                      ? t("registerFree")
                      : t("payAndRegister", { price: formatPrice(activity.priceCents, locale) })}
                </button>
                {free ? null : <p className="text-center text-[11px] text-zinc-500">{t("ticketSecurePayment")}</p>}
              </form>
            )}
          </Card>
        </section>
      )}

      {detail.offersMemberships && (plans.length > 0 || !sessionSales) ? (
        <section>
          <SectionTitle eyebrow={t("plansEyebrow")} title={t("plansTitle")} subtitle={t("plansSubtitle")} />
          {plans.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-600">{t("noPlans")}</p>
            </Card>
          ) : (
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.id} className="card card-hover flex h-full flex-col p-5">
                  {/* Hauteurs fixes (titre, description) : prix et boutons alignés d'une carte à l'autre. */}
                  <div className="flex min-h-12 items-start justify-between gap-3">
                    <h3 className="line-clamp-2 text-base font-bold text-zinc-900">{plan.name}</h3>
                    <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">
                      {tCommon("sessions", { count: plan.sessionsIncluded })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-600" title={plan.description ?? undefined}>
                    {plan.description}
                  </p>
                  <p className="mt-3 text-2xl font-black text-gold-dark">{formatPrice(plan.priceCents, locale)}</p>
                  <p className="text-xs text-zinc-500">
                    {t("perSession", {
                      price: formatPrice(Math.round(plan.priceCents / Math.max(plan.sessionsIncluded, 1)), locale),
                    })}
                  </p>

                  <ul className="mt-4 flex-1 space-y-1.5 text-sm text-zinc-700">
                    <li>📍 {plan.address ?? address}</li>
                    <li>🕒 {plan.scheduleText ?? activity.scheduleText}</li>
                    <li>{t("validity", { days: tCommon("days", { count: plan.validityDays }) })}</li>
                    <li>{t("included", { count: plan.sessionsIncluded })}</li>
                  </ul>
                  {plan.extraInfo ? (
                    <p className="mt-3 line-clamp-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
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
      ) : null}

      {detail.offersMemberships ? (
        <section className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <div id="seances" className="flex scroll-mt-20 flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900">{t("upcomingTitle")}</h2>
              <p className="text-xs text-zinc-500">
                {filtered
                  ? t("upcomingFiltered", { shown: upcoming.length, total: upcomingTotal })
                  : t("upcomingCountLabel", { count: upcomingTotal })}
              </p>
            </div>

            {sessionSales ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-zinc-700">
                🎟️ {t("sessionSalesHint", { price: formatPrice(activity.priceCents, locale) })}
              </p>
            ) : null}
            {ticketNotice ? (
              <div role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-gold-dark">
                {ticketNotice}
              </div>
            ) : null}

            {upcomingTotal > 0 ? (
              <form
                action={`${pagePath}#seances`}
                className="mt-3 grid items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]"
              >
                <div>
                  <label className="label" htmlFor="du">
                    {t("filterFrom")}
                  </label>
                  <input id="du" name="du" type="date" min={today} defaultValue={du ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="au">
                    {t("filterTo")}
                  </label>
                  <input id="au" name="au" type="date" min={du ?? today} defaultValue={au ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="lieu">
                    {t("filterPlace")}
                  </label>
                  <select id="lieu" name="lieu" defaultValue={lieu ?? ""} className="select">
                    <option value="">{t("allPlaces")}</option>
                    {upcomingPlaces.map((place) => (
                      <option key={place} value={place}>
                        {place}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary" type="submit">
                    {tCommon("filter")}
                  </button>
                  {filtered ? (
                    <Link href={`${pagePath}#seances`} className="btn btn-ghost" aria-label={tCommon("reset")}>
                      ✕
                    </Link>
                  ) : null}
                </div>
              </form>
            ) : null}

            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">{filtered ? t("noUpcomingFiltered") : t("noUpcoming")}</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {upcoming.map((session) => (
                  <li
                    key={session.id}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5"
                  >
                    <p className="text-xs font-semibold text-emerald-700">
                      🟢 {formatDate(session.startsAt, locale)} · {formatTime(session.startsAt, locale)}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-zinc-900">{session.title ?? activity.name}</p>
                    <p className="truncate text-xs text-zinc-600">
                      📍 {session.location || address} · {formatDuration(session.durationMinutes, locale)}
                    </p>
                    {sessionSales ? (
                      session.placesLeft > 0 ? (
                        <form action={buyTicketAction} className="mt-2">
                          <input type="hidden" name="sessionId" value={session.id} />
                          <button className="btn btn-primary btn-sm w-full" type="submit">
                            {t("bookSession", { price: formatPrice(activity.priceCents, locale) })}
                          </button>
                        </form>
                      ) : (
                        <p className="mt-2 text-center text-xs font-semibold text-rose-700">{t("soldOut")}</p>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-zinc-900">{t("pastTitle")}</h2>
            {past.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">{t("noPast")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {past.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-zinc-700">{session.title ?? activity.name}</p>
                      <p className="text-xs text-zinc-500">{session.location ?? address}</p>
                    </div>
                    <p className="text-xs text-zinc-500">⚪ {formatDate(session.startsAt, locale)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
