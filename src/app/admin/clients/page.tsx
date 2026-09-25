import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClientAction, deleteClientAction } from "@/app/actions/admin";
import { hasClientFilters, listAdminClients } from "@/lib/queries";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { formatDate } from "@/lib/format";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";
import { localeNames, locales } from "@/i18n/config";
import { Card, SectionTitle } from "@/components/ui";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    erreur?: string;
    q?: string;
    role?: string;
    verifie?: string;
    abo?: string;
    tri?: string;
  }>;
}) {
  const { ok, erreur, ...filters } = await searchParams;
  const [locale, t, tCommon, tStatus, tAuth, tDetail] = await Promise.all([
    getLocale(),
    getTranslations("admin.clients"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("auth"),
    getTranslations("admin.clientDetail"),
  ]);
  const clients = await listAdminClients(filters);
  const filtered = hasClientFilters(filters);
  const exportHref = `/admin/clients/export${new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value) as [string, string][],
  ).toString().replace(/^(.)/, "?$1")}`;

  return (
    <div className="space-y-8">
      <Flash ok={ok} erreur={erreur} />

      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <FilterBar
        action="/admin/clients"
        active={filtered}
        submitLabel={tCommon("search")}
        resetLabel={tCommon("reset")}
      >
        <FilterText
          name="q"
          label={t("searchLabel")}
          defaultValue={filters.q}
          placeholder={t("searchPlaceholder")}
        />
        <FilterSelect
          name="role"
          label={t("filterRole")}
          defaultValue={filters.role}
          placeholder={tCommon("all")}
          options={[
            { value: "client", label: tStatus("role.client") },
            { value: "admin", label: tStatus("role.admin") },
          ]}
        />
        <FilterSelect
          name="verifie"
          label={t("filterVerified")}
          defaultValue={filters.verifie}
          placeholder={tCommon("all")}
          options={[
            { value: "oui", label: t("verifiedYes") },
            { value: "non", label: t("verifiedNo") },
          ]}
        />
        <FilterSelect
          name="abo"
          label={t("filterSubscription")}
          defaultValue={filters.abo}
          placeholder={tCommon("all")}
          options={[
            { value: "actif", label: t("subActive") },
            { value: "aucun", label: t("subNone") },
          ]}
        />
        <FilterSelect
          name="tri"
          label={tCommon("sortBy")}
          defaultValue={filters.tri}
          options={[
            { value: "recent", label: t("sortRecent") },
            { value: "ancien", label: t("sortOldest") },
            { value: "nom", label: t("sortName") },
            { value: "abonnements", label: t("sortSubscriptions") },
            { value: "seances", label: t("sortSessions") },
          ]}
        />
      </FilterBar>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{t("resultCount", { count: clients.length })}</p>
        <a className="btn btn-ghost sm:w-auto" href={exportHref} download>
          {t("exportExcel")}
        </a>
      </div>

      <div className="card scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t("colClient")}</th>
              <th>{t("colContact")}</th>
              <th>{t("colRole")}</th>
              <th>{t("colSubs")}</th>
              <th>{t("colSessions")}</th>
              <th>{t("colJoined")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((row) => (
              <tr key={row.user.id}>
                <td>
                  <span className="font-semibold text-white">
                    {row.user.firstName} {row.user.lastName}
                  </span>
                  {row.user.city ? <span className="block text-xs text-zinc-500">{row.user.city}</span> : null}
                </td>
                <td className="text-zinc-400">
                  <span dir="ltr">{row.user.email}</span>
                  {row.user.phone ? (
                    <span className="block text-xs" dir="ltr">
                      {row.user.phone}
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className={`badge ${row.user.role === "admin" ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : ""}`}>
                    {tStatus(`role.${row.user.role}`)}
                  </span>
                </td>
                <td>
                  <span className="text-zinc-200">{row.subscriptions}</span>
                  <span className="ms-1 text-xs text-emerald-300">{t("activeCount", { count: row.active })}</span>
                </td>
                <td className="text-zinc-300">{row.attendances}</td>
                <td className="whitespace-nowrap text-zinc-400">{formatDate(row.user.createdAt, locale)}</td>
                <td>
                  <div className="flex gap-2">
                    <Link href={`/admin/clients/${row.user.id}`} className="btn btn-ghost btn-sm">
                      {t("file")}
                    </Link>
                    <form action={deleteClientAction}>
                      <input type="hidden" name="id" value={row.user.id} />
                      <button className="btn btn-danger btn-sm" type="submit">
                        {tCommon("delete")}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-zinc-500">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section>
        <SectionTitle eyebrow={t("newEyebrow")} title={t("newTitle")} />
        <Card>
          <form action={createClientAction} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="firstName">
                {t("firstName")}
              </label>
              <input id="firstName" name="firstName" required maxLength={80} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="lastName">
                {t("lastName")}
              </label>
              <input id="lastName" name="lastName" required maxLength={80} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">
                {t("email")}
              </label>
              <input id="email" name="email" type="email" required maxLength={180} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="phone">
                {t("phone")}
              </label>
              <input id="phone" name="phone" type="tel" maxLength={25} placeholder={tAuth("phonePlaceholder")} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="city">
                {t("city")}
              </label>
              <input id="city" name="city" maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="role">
                {t("role")}
              </label>
              <select id="role" name="role" className="select" defaultValue="client">
                <option value="client">{tStatus("role.client")}</option>
                <option value="admin">{tStatus("role.admin")}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="locale">
                {tDetail("language")}
              </label>
              <select id="locale" name="locale" className="select" defaultValue={locale}>
                {locales.map((option) => (
                  <option key={option} value={option} lang={option}>
                    {localeNames[option].native}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="password">
                {t("initialPassword")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                className="input"
              />
              <p className="mt-1 text-xs text-zinc-500">{tAuth("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="notes">
                {t("notes")}
              </label>
              <textarea id="notes" name="notes" maxLength={2000} className="textarea" />
            </div>
            <p className="text-xs text-zinc-500 sm:col-span-2">{t("emailNotice")}</p>
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
