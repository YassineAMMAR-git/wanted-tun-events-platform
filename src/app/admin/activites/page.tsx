import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, CATEGORY_TRANSLATABLE, activities, categories } from "@/db/schema";
import { createActivityAction, deleteActivityAction } from "@/app/actions/admin";
import { formatPrice } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card, SectionTitle } from "@/components/ui";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { Flash } from "@/components/flash";
import { TranslationFields } from "@/components/translation-fields";

export const dynamic = "force-dynamic";

export default async function AdminActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    erreur?: string;
    q?: string;
    categorie?: string;
    statut?: string;
    tri?: string;
  }>;
}) {
  const { ok, erreur, q, categorie, statut, tri } = await searchParams;
  const [locale, t, tCommon, tStatus] = await Promise.all([
    getLocale(),
    getTranslations("admin.activities"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const search = q?.trim().slice(0, 100);
  const conditions: SQL[] = [];
  if (search) {
    const like = `%${search}%`;
    conditions.push(or(ilike(activities.name, like), ilike(activities.city, like), ilike(activities.address, like))!);
  }
  if (categorie) conditions.push(eq(activities.categoryId, Number(categorie)));
  if (statut === "active" || statut === "hidden") conditions.push(eq(activities.status, statut));

  const sessionsCount = sql<number>`(select count(*) from sessions s where s.activity_id = ${activities.id})::int`;
  const plansCount = sql<number>`(select count(*) from plans p where p.activity_id = ${activities.id})::int`;

  const order = {
    nom: [asc(activities.name)],
    prix: [asc(activities.priceCents)],
    seances: [desc(sessionsCount)],
    recent: [desc(activities.id)],
  }[tri ?? ""] ?? [asc(categories.position), asc(activities.name)];

  const [rows, categoryList] = await Promise.all([
    db
      .select({
        activity: activities,
        category: categories,
        sessionsCount,
        plansCount,
      })
      .from(activities)
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...order),
    db.select().from(categories).orderBy(asc(categories.position)),
  ]);

  const filtered = Boolean(search || categorie || statut || tri);

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <FilterBar action="/admin/activites" active={filtered} submitLabel={tCommon("search")} resetLabel={tCommon("reset")}>
        <FilterText name="q" label={tCommon("search")} defaultValue={search} placeholder={t("searchPlaceholder")} />
        <FilterSelect
          name="categorie"
          label={t("filterCategory")}
          defaultValue={categorie}
          placeholder={tCommon("all")}
          options={categoryList.map((category) => ({
            value: String(category.id),
            label: `${category.emoji} ${localize(category, locale, CATEGORY_TRANSLATABLE).name}`,
          }))}
        />
        <FilterSelect
          name="statut"
          label={t("filterStatus")}
          defaultValue={statut}
          placeholder={tCommon("all")}
          options={[
            { value: "active", label: tStatus("activity.active") },
            { value: "hidden", label: tStatus("activity.hidden") },
          ]}
        />
        <FilterSelect
          name="tri"
          label={tCommon("sortBy")}
          defaultValue={tri}
          options={[
            { value: "", label: t("sortCategory") },
            { value: "nom", label: t("sortName") },
            { value: "prix", label: t("sortPrice") },
            { value: "seances", label: t("sortSessions") },
            { value: "recent", label: t("sortRecent") },
          ]}
        />
      </FilterBar>

      <p className="text-sm text-zinc-400">{t("resultCount", { count: rows.length })}</p>

      <div className="card scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t("colActivity")}</th>
              <th>{t("colCategory")}</th>
              <th>{t("colPlace")}</th>
              <th>{t("colSchedule")}</th>
              <th>{t("colPrice")}</th>
              <th>{t("colSessions")}</th>
              <th>{t("colPlans")}</th>
              <th>{t("colStatus")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
              return (
                <tr key={activity.id}>
                  <td>
                    <Link href={`/admin/activites/${activity.id}`} className="font-semibold text-white hover:text-amber-300">
                      {activity.name}
                    </Link>
                    <span className="block text-xs text-zinc-500" dir="ltr">
                      /{activity.slug}
                    </span>
                  </td>
                  <td className="text-zinc-400">{localize(row.category, locale, CATEGORY_TRANSLATABLE).name}</td>
                  <td className="text-zinc-400">
                    {activity.address}
                    <span className="block text-xs">{activity.city}</span>
                  </td>
                  <td className="text-zinc-400">{activity.scheduleText}</td>
                  <td className="whitespace-nowrap">{formatPrice(activity.priceCents, locale)}</td>
                  <td className="text-zinc-200">{row.sessionsCount}</td>
                  <td className="text-zinc-200">{row.plansCount}</td>
                  <td>
                    <span
                      className={`badge ${
                        activity.status === "active"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                      }`}
                    >
                      {tStatus(activity.status === "active" ? "activity.active" : "activity.hidden")}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <Link href={`/admin/activites/${activity.id}`} className="btn btn-ghost btn-sm">
                        {tCommon("manage")}
                      </Link>
                      <form action={deleteActivityAction}>
                        <input type="hidden" name="id" value={activity.id} />
                        <button className="btn btn-danger btn-sm" type="submit">
                          {tCommon("delete")}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section>
        <SectionTitle eyebrow={t("newEyebrow")} title={t("newTitle")} />
        <Card>
          <form action={createActivityAction} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TranslationFields
                gridClassName="grid gap-4 sm:grid-cols-2"
                fields={[
                  { name: "name", label: t("name"), required: true, maxLength: 180 },
                  { name: "scheduleText", label: t("schedule"), maxLength: 200, placeholder: t("schedulePlaceholder") },
                  { name: "shortDescription", label: t("shortDescription"), maxLength: 280, className: "sm:col-span-2" },
                  { name: "description", label: t("description"), multiline: true, maxLength: 5000, className: "sm:col-span-2" },
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="categoryId">
                {t("category")}
              </label>
              <select id="categoryId" name="categoryId" required className="select">
                {categoryList.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji} {localize(category, locale, CATEGORY_TRANSLATABLE).name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="address">
                {t("address")}
              </label>
              <input id="address" name="address" maxLength={240} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="city">
                {t("city")}
              </label>
              <input id="city" name="city" maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="durationMinutes">
                {t("duration")}
              </label>
              <input id="durationMinutes" name="durationMinutes" type="number" min={15} defaultValue={90} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="price">
                {t("price")}
              </label>
              <input id="price" name="price" type="number" step="0.01" min={0} defaultValue={0} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="capacity">
                {t("capacity")}
              </label>
              <input id="capacity" name="capacity" type="number" min={1} defaultValue={30} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="imageUrl">
                {t("image")}
              </label>
              <input id="imageUrl" name="imageUrl" type="url" className="input" placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn btn-primary" type="submit">
                {t("create")}
              </button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
