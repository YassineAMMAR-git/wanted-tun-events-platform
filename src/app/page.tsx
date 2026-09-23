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
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=1600')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b0b0d] via-[#0b0b0d]/85 to-[#0b0b0d]/40 rtl:bg-gradient-to-bl" />
        <div className="relative grid gap-8 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="mt-3 text-4xl leading-[1.15] font-black tracking-tight text-white sm:text-5xl">
              {t("titleLine1")}
              <span className="block bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
                {t("titleLine2")}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-zinc-300">{t("intro")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
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
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 text-center">
              {[
                { k: String(categories.length), v: t("stats.categories") },
                { k: "100%", v: t("stats.online") },
                { k: t("stats.reminderValue"), v: t("stats.reminder") },
              ].map((item) => (
                <div key={item.v} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3">
                  <dt className="text-2xl font-black text-amber-300">{item.k}</dt>
                  <dd className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-5 sm:p-6">
            <p className="eyebrow mb-3">{t("upcomingTitle")}</p>
            <ul className="space-y-3">
              {upcoming.length === 0 ? (
                <li className="text-sm text-zinc-400">{t("noUpcoming")}</li>
              ) : (
                upcoming.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/3 p-3"
                  >
                    <span className="mt-0.5 text-lg">{session.emoji ?? "✨"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{session.activityName}</p>
                      <p className="text-xs text-zinc-400">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => {
            const available = category.activityCount > 0;
            return (
              <Link
                key={category.id}
                href={available ? `/activites?categorie=${category.slug}` : "/activites"}
                className={`card card-hover p-5 ${available ? "" : "opacity-75"}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{category.emoji}</span>
                  {category.comingSoon ? (
                    <span className="badge border-sky-400/30 bg-sky-400/10 text-sky-300">{t("comingSoon")}</span>
                  ) : (
                    <span className="badge border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                      {tCommon("activitiesCount", { count: category.activityCount })}
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-base font-bold text-white">{category.name}</h3>
                <p className="mt-1.5 line-clamp-3 text-xs text-zinc-400">{category.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* PARCOURS */}
      <section>
        <SectionTitle eyebrow={t("stepsEyebrow")} title={t("stepsTitle")} subtitle={t("stepsSubtitle")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step} className="card-hover">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/15 text-sm font-black text-amber-300">
                {index + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-white">{t(`steps.${step}.title`)}</h3>
              <p className="mt-1.5 text-sm text-zinc-400">{t(`steps.${step}.text`)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="card flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div>
          <h2 className="text-2xl font-bold text-white">{t("ctaTitle")}</h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">{t("ctaText")}</p>
        </div>
        <div className="flex shrink-0 gap-3">
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
