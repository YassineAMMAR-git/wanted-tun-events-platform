import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureSeeded } from "@/lib/seed";
import { getCategoriesWithCounts, getHeroSlides, getUpcomingSessions } from "@/lib/queries";
import { formatDate, formatTime, safeLink } from "@/lib/format";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { HeroCarousel, type HeroSlideView } from "@/components/hero-carousel";
import { offersMemberships } from "@/lib/memberships";

export const dynamic = "force-dynamic";

const STEPS = ["account", "activity", "plan", "pay", "follow", "confirm"] as const;

/** Diapositives affichées tant qu'aucune n'est active dans l'administration (textes traduits dans home.carousel.defaults). */
const DEFAULT_SLIDES = [
  {
    key: "welcome",
    href: "/activites",
    image:
      "https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=1600",
  },
  {
    key: "plans",
    href: "/abonnements",
    image:
      "https://images.pexels.com/photos/8522562/pexels-photo-8522562.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=1600",
  },
  {
    key: "reminders",
    href: "/inscription",
    image:
      "https://images.pexels.com/photos/38996330/pexels-photo-38996330.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=1600",
  },
] as const;

export default async function HomePage() {
  await ensureSeeded();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("home")]);
  const [categories, upcoming, storedSlides] = await Promise.all([
    getCategoriesWithCounts(locale),
    getUpcomingSessions(locale, 4),
    getHeroSlides(locale),
  ]);
  const tCommon = await getTranslations("common");

  const slides: HeroSlideView[] =
    storedSlides.length > 0
      ? storedSlides.map((slide) => ({
          id: slide.id,
          eyebrow: slide.eyebrow,
          title: slide.title,
          text: slide.text,
          imageUrl: slide.imageUrl,
          ctaLabel: slide.ctaLabel,
          ctaUrl: safeLink(slide.ctaUrl),
        }))
      : DEFAULT_SLIDES.map((slide) => ({
          id: slide.key,
          eyebrow: t(`carousel.defaults.${slide.key}.eyebrow`),
          title: t(`carousel.defaults.${slide.key}.title`),
          text: t(`carousel.defaults.${slide.key}.text`),
          imageUrl: slide.image,
          ctaLabel: t(`carousel.defaults.${slide.key}.cta`),
          ctaUrl: slide.href,
        }));

  return (
    <div className="space-y-12">
      <HeroCarousel slides={slides} />

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
                {offersMemberships(category.slug) ? (
                  <p className="mt-2 text-xs font-semibold text-gold-dark">🎟️ {t("membershipsBadge")}</p>
                ) : null}
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

      {/* PROCHAINES SÉANCES */}
      <section>
        <SectionTitle
          eyebrow={t("upcomingEyebrow")}
          title={t("upcomingTitle")}
          action={
            <Link href="/activites" className="btn btn-ghost btn-sm self-start sm:self-auto">
              {t("seeProgram")}
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState title={t("noUpcoming")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((session) => (
              <Link key={session.id} href={`/activites/${session.activitySlug}`} className="card card-hover p-4">
                <span className="text-xl">{session.emoji ?? "✨"}</span>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold text-zinc-900">{session.activityName}</h3>
                <p className="mt-1.5 text-xs font-medium text-emerald-700">
                  🟢 {formatDate(session.startsAt, locale)} — {formatTime(session.startsAt, locale)}
                </p>
                {session.location ? <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{session.location}</p> : null}
              </Link>
            ))}
          </div>
        )}
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
