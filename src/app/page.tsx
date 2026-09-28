import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getCategoriesWithCounts, getUpcomingSessions } from "@/lib/queries";
import { formatDate, formatTime } from "@/lib/format";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = ["account", "activity", "plan", "pay", "follow", "confirm"] as const;

export default async function HomePage() {
  await ensureSeeded();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("home")]);
  const [categories, upcoming] = await Promise.all([getCategoriesWithCounts(locale), getUpcomingSessions(locale, 5)]);
  const tCommon = await getTranslations("common");

  return (
    <div className="space-y-12">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=1600')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-white via-white/90 to-white/50 rtl:bg-gradient-to-bl" />
        <div className="relative grid gap-4 px-5 py-8 sm:px-8 sm:py-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="mt-2 text-3xl leading-[1.15] font-black tracking-tight text-zinc-900 sm:text-4xl">
              {t("titleLine1")}
              <span className="block bg-gradient-to-r from-gold to-brand-red bg-clip-text text-transparent">
                {t("titleLine2")}
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-700 sm:text-base">{t("intro")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/activites" className="btn btn-primary">
                {t("discover")}
              </Link>
              <Link href="/inscription" className="btn btn-ghost">
                {t("createAccount")}
              </Link>
              <Link href="/connexion" className="btn btn-ghost">
                {t("mySpace")}
              </Link>
            </div>
            <dl className="mt-5 grid max-w-md grid-cols-3 gap-3 text-center">
              {[
                { k: String(categories.length), v: t("stats.categories") },
                { k: "100%", v: t("stats.online") },
                { k: t("stats.reminderValue"), v: t("stats.reminder") },
              ].map((item) => (
                <div key={item.v} className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
                  <dt className="text-xl font-black text-gold-dark">{item.k}</dt>
                  <dd className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-4 sm:p-5">
            <p className="eyebrow mb-3">{t("upcomingTitle")}</p>
            <ul className="space-y-2">
              {upcoming.length === 0 ? (
                <li className="text-sm text-zinc-600">{t("noUpcoming")}</li>
              ) : (
                upcoming.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5"
                  >
                    <span className="mt-0.5 text-base">{session.emoji ?? "✨"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">{session.activityName}</p>
                      <p className="text-xs text-zinc-600">
                        🟢 {formatDate(session.startsAt, locale)} — {formatTime(session.startsAt, locale)}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{session.location ?? session.activitySlug}</p>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <Link href="/activites" className="btn btn-ghost btn-sm mt-4 w-full">
              {t("seeProgram")}
            </Link>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section>
        <SectionTitle eyebrow={t("categoriesEyebrow")} title={t("categoriesTitle")} subtitle={t("categoriesSubtitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => {
            const available = category.activityCount > 0;
            return (
              <Link
                key={category.id}
                href={available ? `/activites?categorie=${category.slug}` : "/activites"}
                className={`card card-hover p-4 ${available ? "" : "opacity-75"}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xl">{category.emoji}</span>
                  {category.comingSoon ? (
                    <span className="badge border-sky-200 bg-sky-50 text-sky-700">{t("comingSoon")}</span>
                  ) : (
                    <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">
                      {tCommon("activitiesCount", { count: category.activityCount })}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-bold text-zinc-900">{category.name}</h3>
                <p className="mt-1.5 line-clamp-3 text-xs text-zinc-600">{category.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* PARCOURS */}
      <section>
        <SectionTitle eyebrow={t("stepsEyebrow")} title={t("stepsTitle")} subtitle={t("stepsSubtitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step} className="card-hover">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-xs font-black text-gold-dark">
                {index + 1}
              </span>
              <h3 className="mt-2.5 text-sm font-bold text-zinc-900">{t(`steps.${step}.title`)}</h3>
              <p className="mt-1 text-sm text-zinc-600">{t(`steps.${step}.text`)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="card flex flex-col items-start gap-4 border-amber-200 bg-gold-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">{t("ctaTitle")}</h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-600">{t("ctaText")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/inscription" className="btn btn-primary">
            {t("createAccount")}
          </Link>
          <Link href="/activites" className="btn btn-ghost">
            {t("ctaOffers")}
          </Link>
        </div>
      </section>
    </div>
  );
}
