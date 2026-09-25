import Link from "next/link";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { CATEGORY_TRANSLATABLE, categories } from "@/db/schema";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/actions/admin";
import { localize } from "@/lib/i18n/content";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";

export const dynamic = "force-dynamic";

const ACCENTS = ["amber", "violet", "emerald", "indigo", "teal", "sky", "rose", "orange"] as const;

/** Pastille de couleur : classes écrites en toutes lettres pour que Tailwind les conserve. */
const ACCENT_DOT: Record<(typeof ACCENTS)[number], string> = {
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  emerald: "bg-emerald-400",
  indigo: "bg-indigo-400",
  teal: "bg-teal-400",
  sky: "bg-sky-400",
  rose: "bg-rose-400",
  orange: "bg-orange-400",
};
const toAccent = (value: string | null) =>
  (ACCENTS as readonly string[]).includes(value ?? "") ? (value as (typeof ACCENTS)[number]) : "amber";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string; q?: string; etat?: string }>;
}) {
  const { ok, erreur, q, etat } = await searchParams;
  const [locale, t, tCommon] = await Promise.all([
    getLocale(),
    getTranslations("admin.categories"),
    getTranslations("common"),
  ]);

  const search = q?.trim().slice(0, 100);
  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(categories.name, `%${search}%`));
  if (etat === "coming") conditions.push(eq(categories.comingSoon, true));
  if (etat === "live") conditions.push(eq(categories.comingSoon, false));

  const rows = await db
    .select({
      category: categories,
      activityCount: sql<number>`(select count(*) from activities a where a.category_id = ${categories.id})::int`,
      sessionCount: sql<number>`(select count(*) from sessions s join activities a on a.id = s.activity_id where a.category_id = ${categories.id})::int`,
    })
    .from(categories)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(categories.position), asc(categories.name));

  const filtered = Boolean(search || etat);

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      {/* ------------------------------ filtres ------------------------------ */}
      <Card>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/admin/categories">
          <div className="flex-1">
            <label className="label" htmlFor="q">
              {t("searchLabel")}
            </label>
            <input
              id="q"
              name="q"
              maxLength={100}
              defaultValue={search ?? ""}
              className="input"
              placeholder={t("searchPlaceholder")}
            />
          </div>
          <div className="sm:w-56">
            <label className="label" htmlFor="etat">
              {t("stateLabel")}
            </label>
            <select id="etat" name="etat" defaultValue={etat ?? ""} className="select">
              <option value="">{tCommon("all")}</option>
              <option value="live">{t("stateLive")}</option>
              <option value="coming">{t("stateComing")}</option>
            </select>
          </div>
          <button className="btn btn-primary sm:w-auto" type="submit">
            {tCommon("search")}
          </button>
          {filtered ? (
            <Link href="/admin/categories" className="btn btn-ghost sm:w-auto">
              {tCommon("reset")}
            </Link>
          ) : null}
        </form>
      </Card>

      {/* ------------------------------- liste ------------------------------- */}
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyText")} />
      ) : (
        <div className="grid gap-4">
          {rows.map(({ category, activityCount, sessionCount }) => {
            const translated = localize(category, locale, CATEGORY_TRANSLATABLE);
            const accent = toAccent(category.accent);
            return (
              <Card key={category.id}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 list-none">
                    <span className="text-2xl">{category.emoji}</span>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block size-2.5 rounded-full ${ACCENT_DOT[accent]}`} aria-hidden="true" />
                      <span className="font-bold text-white">{translated.name}</span>
                    </span>
                    {category.comingSoon ? (
                      <span className="badge border-sky-400/30 bg-sky-400/10 text-sky-300">{t("comingSoon")}</span>
                    ) : null}
                    <span className="text-xs text-zinc-500">
                      {t("counts", { activities: activityCount, sessions: sessionCount })}
                    </span>
                    <span className="ms-auto text-xs text-zinc-500" dir="ltr">
                      #{category.position} · /{category.slug}
                    </span>
                  </summary>

                  <form action={updateCategoryAction} className="mt-5 space-y-4 border-t border-white/8 pt-5">
                    <input type="hidden" name="id" value={category.id} />

                    <TranslationFields
                      translations={category.translations}
                      values={{ name: category.name, description: category.description }}
                      fields={[
                        { name: "name", label: t("fieldName"), required: true, maxLength: 120 },
                        { name: "description", label: t("fieldDescription"), multiline: true, maxLength: 500 },
                      ]}
                    />

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="label">{t("fieldEmoji")}</label>
                        <input name="emoji" defaultValue={category.emoji ?? "✨"} maxLength={8} className="input" />
                      </div>
                      <div>
                        <label className="label">{t("fieldAccent")}</label>
                        <select name="accent" defaultValue={accent} className="select">
                          {ACCENTS.map((value) => (
                            <option key={value} value={value}>
                              {t(`accents.${value}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">{t("fieldPosition")}</label>
                        <input
                          name="position"
                          type="number"
                          min={0}
                          defaultValue={category.position}
                          className="input"
                        />
                      </div>
                      <label className="flex items-end gap-2 pb-2 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          name="comingSoon"
                          defaultChecked={category.comingSoon}
                          className="size-4 accent-amber-400"
                        />
                        {t("fieldComingSoon")}
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-primary sm:w-auto" type="submit">
                        {tCommon("save")}
                      </button>
                      <Link href={`/admin/activites?categorie=${category.id}`} className="btn btn-ghost sm:w-auto">
                        {t("seeActivities")}
                      </Link>
                    </div>
                  </form>

                  <form action={deleteCategoryAction} className="mt-3 border-t border-white/8 pt-3">
                    <input type="hidden" name="id" value={category.id} />
                    <button className="btn btn-danger sm:w-auto" type="submit" disabled={activityCount > 0}>
                      {tCommon("delete")}
                    </button>
                    {activityCount > 0 ? (
                      <span className="ms-3 text-xs text-zinc-500">{t("deleteBlocked", { count: activityCount })}</span>
                    ) : null}
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------ création ----------------------------- */}
      <Card className="border-amber-300/20">
        <h2 className="text-base font-bold text-white">{t("createTitle")}</h2>
        <p className="mt-1 text-sm text-zinc-400">{t("createHint")}</p>

        <form action={createCategoryAction} className="mt-4 space-y-4">
          <TranslationFields
            fields={[
              { name: "name", label: t("fieldName"), required: true, maxLength: 120 },
              { name: "description", label: t("fieldDescription"), multiline: true, maxLength: 500 },
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label">{t("fieldEmoji")}</label>
              <input name="emoji" defaultValue="✨" maxLength={8} className="input" />
            </div>
            <div>
              <label className="label">{t("fieldAccent")}</label>
              <select name="accent" defaultValue="amber" className="select">
                {ACCENTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`accents.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("fieldPosition")}</label>
              <input name="position" type="number" min={0} defaultValue={rows.length + 1} className="input" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-zinc-300">
              <input type="checkbox" name="comingSoon" className="size-4 accent-amber-400" />
              {t("fieldComingSoon")}
            </label>
          </div>

          <button className="btn btn-primary sm:w-auto" type="submit">
            {t("createSubmit")}
          </button>
        </form>
      </Card>
    </div>
  );
}
