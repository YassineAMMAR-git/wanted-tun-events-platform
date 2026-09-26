import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getCategoriesWithCounts, listActivePlans } from "@/lib/queries";
import { subscribeAction } from "@/app/actions/booking";
import { formatDuration, formatPrice } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/ui";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; tri?: string }>;
}) {
  await ensureSeeded();
  const params = await searchParams;
  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("plansPage"), getTranslations("common")]);
  const search = params.q?.trim().slice(0, 100);
  const [rows, categoryList] = await Promise.all([
    listActivePlans(locale, { search, categorySlug: params.categorie, sort: params.tri }),
    getCategoriesWithCounts(locale),
  ]);
  const filtered = Boolean(search || params.categorie || params.tri);

  return (
    <div className="space-y-8">
      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <FilterBar action="/abonnements" active={filtered} submitLabel={tCommon("filter")} resetLabel={tCommon("reset")}>
        <FilterText name="q" label={tCommon("search")} defaultValue={search} placeholder={t("searchPlaceholder")} />
        <FilterSelect
          name="categorie"
          label={t("filterCategory")}
          defaultValue={params.categorie}
          placeholder={tCommon("all")}
          options={categoryList.map((category) => ({
            value: category.slug,
            label: `${category.emoji} ${category.name}`,
          }))}
        />
        <FilterSelect
          name="tri"
          label={tCommon("sortBy")}
          defaultValue={params.tri}
          options={[
            { value: "", label: t("sortDefault") },
            { value: "prix", label: t("sortPriceAsc") },
            { value: "prixDesc", label: t("sortPriceDesc") },
            { value: "seances", label: t("sortSessions") },
          ]}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ plan, activity, categoryName, categoryEmoji }) => (
            <div key={plan.id} className="card card-hover flex flex-col p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge border-white/12 bg-white/5">
                  {categoryEmoji} {categoryName}
                </span>
                <span className="badge border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                  {tCommon("sessions", { count: plan.sessionsIncluded })}
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">{plan.name}</h3>
              <Link href={`/activites/${activity.slug}`} className="mt-1 text-sm text-amber-300 hover:underline">
                {activity.name}
              </Link>
              <p className="mt-4 text-3xl font-black text-amber-300">{formatPrice(plan.priceCents, locale)}</p>
              <dl className="mt-4 space-y-1.5 text-sm text-zinc-300">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("validity")}</dt>
                  <dd>{tCommon("days", { count: plan.validityDays })}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("schedule")}</dt>
                  <dd className="text-end">{plan.scheduleText ?? activity.scheduleText}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("durationPerSession")}</dt>
                  <dd>{formatDuration(activity.durationMinutes, locale)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("location")}</dt>
                  <dd className="text-end">{plan.address ?? activity.address}</dd>
                </div>
              </dl>
              <form action={subscribeAction} className="mt-5">
                <input type="hidden" name="planId" value={plan.id} />
                <button className="btn btn-primary w-full" type="submit">
                  {t("subscribe")}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
