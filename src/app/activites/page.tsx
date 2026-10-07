import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getCategoriesWithCounts, listActivities } from "@/lib/queries";
import { formatDate, formatDuration, formatPrice, formatTime } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string; q?: string; tri?: string }>;
}) {
  await ensureSeeded();
  const params = await searchParams;
  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("activities"), getTranslations("common")]);
  const [categories, activities] = await Promise.all([
    getCategoriesWithCounts(locale),
    listActivities(locale, { categorySlug: params.categorie, search: params.q, sort: params.tri }),
  ]);

  const current = categories.find((category) => category.slug === params.categorie);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow={t("eyebrow")}
        title={current ? current.name : t("title")}
        subtitle={current?.description ?? t("subtitle")}
      />

      <form className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end" action="/activites">
        <div className="flex-1">
          <label className="label" htmlFor="categorie">
            {t("category")}
          </label>
          <select id="categorie" name="categorie" defaultValue={params.categorie ?? ""} className="select">
            <option value="">{t("allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.emoji} {category.name}
                {category.comingSoon ? t("comingSoonSuffix") : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="q">
            {t("search")}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={t("searchPlaceholder")}
            maxLength={100}
            className="input"
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="tri">
            {tCommon("sortBy")}
          </label>
          <select id="tri" name="tri" defaultValue={params.tri ?? ""} className="select">
            <option value="">{t("sortDefault")}</option>
            <option value="nom">{t("sortName")}</option>
            <option value="prix">{t("sortPrice")}</option>
            <option value="prochaine">{t("sortNext")}</option>
          </select>
        </div>
        <button className="btn btn-primary sm:w-auto" type="submit">
          {tCommon("filter")}
        </button>
        {params.categorie || params.q || params.tri ? (
          <Link href="/activites" className="btn btn-ghost">
            {tCommon("reset")}
          </Link>
        ) : null}
      </form>

      {activities.some((row) => row.memberships && row.planCount > 0) ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-gold-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-zinc-900">🎟️ {t("membershipsTitle")}</p>
            <p className="mt-0.5 text-sm text-zinc-600">{t("membershipsText")}</p>
          </div>
          <Link href="/abonnements" className="btn btn-primary btn-sm shrink-0">
            {t("membershipsCta")}
          </Link>
        </div>
      ) : null}

      {activities.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyText")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activities.map(({ activity, categoryName, categoryEmoji, memberships, sessionCount, planCount, minPrice, nextSession }) => (
            <article key={activity.id} className="card card-hover overflow-hidden">
              <div className="relative h-36 w-full overflow-hidden bg-zinc-100">
                {activity.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activity.imageUrl} alt={activity.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-amber-100 to-rose-100" />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/35 to-transparent p-2.5">
                  <span className="badge border-transparent bg-white/95 text-zinc-800 shadow-sm">
                    {categoryEmoji} {categoryName}
                  </span>
                  <span className="badge border-transparent bg-white/95 text-zinc-800 shadow-sm">
                    {memberships
                      ? t("upcomingSessions", { count: sessionCount })
                      : nextSession
                        ? `📅 ${formatDate(nextSession, locale)}`
                        : t("dateTba")}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-base font-bold text-zinc-900">{activity.name}</h3>
                <p className="mt-1.5 text-sm text-zinc-600">{activity.shortDescription}</p>

                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("location")}</dt>
                    <dd className="text-zinc-700">
                      {activity.address}
                      {activity.city ? `, ${activity.city}` : ""}
                    </dd>
                  </div>
                  {memberships || activity.scheduleText ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-zinc-500">{t("schedule")}</dt>
                      <dd className="text-zinc-700">{activity.scheduleText}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("duration")}</dt>
                    <dd className="text-zinc-700">{formatDuration(activity.durationMinutes, locale)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{memberships ? t("price") : t("ticket")}</dt>
                    <dd className="text-zinc-700">
                      {minPrice
                        ? t("fromPrice", { price: formatPrice(minPrice, locale) })
                        : !memberships && activity.priceCents <= 0
                          ? t("free")
                          : formatPrice(activity.priceCents, locale)}
                    </dd>
                  </div>
                  {nextSession ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-zinc-500">{memberships ? t("next") : t("date")}</dt>
                      <dd className="text-zinc-700">
                        {tCommon("dateAtTime", {
                          date: formatDate(nextSession, locale),
                          time: formatTime(nextSession, locale),
                        })}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-5 flex items-center justify-between gap-3">
                  {memberships && planCount > 0 ? (
                    <Link href={`/activites/${activity.slug}`} className="text-xs font-medium text-gold-dark hover:underline">
                      {t("planCount", { count: planCount })}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <Link
                    href={memberships ? `/activites/${activity.slug}` : `/activites/${activity.slug}#billet`}
                    className="btn btn-primary btn-sm"
                  >
                    {memberships ? t("view") : t("book")}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
