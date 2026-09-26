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
    <div className="space-y-8">
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

      {activities.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyText")} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {activities.map(({ activity, categoryName, categoryEmoji, sessionCount, planCount, minPrice, nextSession }) => (
            <article key={activity.id} className="card card-hover overflow-hidden">
              <div className="relative h-40 w-full overflow-hidden bg-[#15151a]">
                {activity.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activity.imageUrl} alt={activity.name} className="h-full w-full object-cover opacity-85" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-amber-500/25 to-violet-600/20" />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent p-3">
                  <span className="badge border-white/20 bg-black/60">
                    {categoryEmoji} {categoryName}
                  </span>
                  <span className="badge border-white/20 bg-black/60">{t("upcomingSessions", { count: sessionCount })}</span>
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-lg font-bold text-white">{activity.name}</h3>
                <p className="mt-1.5 text-sm text-zinc-400">{activity.shortDescription}</p>

                <dl className="mt-4 grid gap-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("location")}</dt>
                    <dd className="text-zinc-300">
                      {activity.address}
                      {activity.city ? `, ${activity.city}` : ""}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("schedule")}</dt>
                    <dd className="text-zinc-300">{activity.scheduleText}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("duration")}</dt>
                    <dd className="text-zinc-300">{formatDuration(activity.durationMinutes, locale)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500">{t("price")}</dt>
                    <dd className="text-zinc-300">
                      {minPrice
                        ? t("fromPrice", { price: formatPrice(minPrice, locale) })
                        : formatPrice(activity.priceCents, locale)}
                    </dd>
                  </div>
                  {nextSession ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-zinc-500">{t("next")}</dt>
                      <dd className="text-zinc-300">
                        {tCommon("dateAtTime", {
                          date: formatDate(nextSession, locale),
                          time: formatTime(nextSession, locale),
                        })}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">{t("planCount", { count: planCount })}</span>
                  <Link href={`/activites/${activity.slug}`} className="btn btn-primary btn-sm">
                    {t("view")}
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
