import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { heroSlides, type HeroSlide } from "@/db/schema";
import { createSlideAction, deleteSlideAction, updateSlideAction } from "@/app/actions/admin";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";

export const dynamic = "force-dynamic";

async function loadSlides(): Promise<HeroSlide[] | null> {
  try {
    return await db.select().from(heroSlides).orderBy(asc(heroSlides.position), asc(heroSlides.id));
  } catch (error) {
    // Table absente tant que « drizzle-kit push » n'a pas été lancé sur cette base.
    console.error("[carrousel] lecture impossible", error);
    return null;
  }
}

export default async function AdminCarouselPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const [t, tCommon, slides] = await Promise.all([
    getTranslations("admin.carousel"),
    getTranslations("common"),
    loadSlides(),
  ]);

  if (slides === null) {
    return (
      <div className="space-y-6">
        <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ⚠️ {t("tableMissing")}
        </div>
      </div>
    );
  }

  const hasActive = slides.some((slide) => slide.isActive);

  const textFields = [
    { name: "eyebrow", label: t("fieldEyebrow"), maxLength: 120 },
    { name: "title", label: t("fieldTitle"), required: true, maxLength: 180 },
    { name: "text", label: t("fieldText"), multiline: true, maxLength: 600, className: "sm:col-span-2" },
    { name: "ctaLabel", label: t("fieldCtaLabel"), maxLength: 60 },
  ];

  const settingsFields = (slide?: HeroSlide) => (
    <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_0.6fr]">
      <div>
        <label className="label">{t("fieldImageUrl")}</label>
        <input
          name="imageUrl"
          type="url"
          required
          defaultValue={slide?.imageUrl ?? ""}
          placeholder="https://"
          className="input"
          dir="ltr"
        />
        <p className="mt-1 text-xs text-zinc-500">{t("fieldImageHint")}</p>
      </div>
      <div>
        <label className="label">{t("fieldCtaUrl")}</label>
        <input name="ctaUrl" defaultValue={slide?.ctaUrl ?? ""} placeholder="/activites" className="input" dir="ltr" />
        <p className="mt-1 text-xs text-zinc-500">{t("fieldCtaHint")}</p>
      </div>
      <div>
        <label className="label">{t("fieldPosition")}</label>
        <input
          name="position"
          type="number"
          min={0}
          defaultValue={slide?.position ?? slides.length + 1}
          className="input"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={slide?.isActive ?? true}
          className="size-4 accent-amber-600"
        />
        {t("fieldActive")}
      </label>
    </div>
  );

  return (
    <div className="space-y-6">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      {!hasActive ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
          ℹ️ {t("defaultsNotice")}
        </div>
      ) : null}

      {/* ------------------------------- liste ------------------------------- */}
      {slides.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyText")} />
      ) : (
        <div className="grid gap-3">
          {slides.map((slide) => (
            <Card key={slide.id} className={slide.isActive ? "" : "opacity-80"}>
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.imageUrl}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded-md border border-zinc-200 bg-zinc-100 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-zinc-900">{slide.title}</p>
                    <p className="truncate text-xs text-zinc-500" dir="ltr">
                      {slide.ctaUrl ?? t("noLink")}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      slide.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {slide.isActive ? t("active") : t("inactive")}
                  </span>
                  <span className="text-xs text-zinc-500" dir="ltr">
                    #{slide.position}
                  </span>
                </summary>

                <form action={updateSlideAction} className="mt-4 space-y-4 border-t border-zinc-200 pt-4">
                  <input type="hidden" name="id" value={slide.id} />
                  <TranslationFields
                    translations={slide.translations}
                    values={{ eyebrow: slide.eyebrow, title: slide.title, text: slide.text, ctaLabel: slide.ctaLabel }}
                    fields={textFields}
                    gridClassName="grid gap-3 sm:grid-cols-2"
                  />
                  {settingsFields(slide)}
                  <button className="btn btn-primary sm:w-auto" type="submit">
                    {tCommon("save")}
                  </button>
                </form>

                <form action={deleteSlideAction} className="mt-3 border-t border-zinc-200 pt-3">
                  <input type="hidden" name="id" value={slide.id} />
                  <button className="btn btn-danger btn-sm" type="submit">
                    {tCommon("delete")}
                  </button>
                </form>
              </details>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------ création ----------------------------- */}
      <Card className="border-amber-200">
        <h2 className="text-base font-bold text-zinc-900">{t("createTitle")}</h2>
        <p className="mt-1 text-sm text-zinc-600">{t("createHint")}</p>

        <form action={createSlideAction} className="mt-4 space-y-4">
          <TranslationFields fields={textFields} gridClassName="grid gap-3 sm:grid-cols-2" />
          {settingsFields()}
          <button className="btn btn-primary sm:w-auto" type="submit">
            {t("createSubmit")}
          </button>
        </form>
      </Card>
    </div>
  );
}
