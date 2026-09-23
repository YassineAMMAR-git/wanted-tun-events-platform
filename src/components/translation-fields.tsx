"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ContentTranslations } from "@/db/schema";
import { translatedLocales, type Locale } from "@/i18n/config";

type FieldConfig = {
  /** Nom du champ en base (ex. « name ») : les inputs s'appellent name, name_en, name_ar. */
  name: string;
  label: ReactNode;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
};

type Props = {
  fields: FieldConfig[];
  /** Valeurs françaises (colonnes habituelles). */
  values?: Record<string, string | null | undefined>;
  translations?: ContentTranslations<string> | null;
  /** Classes de la grille contenant les champs d'une langue. */
  gridClassName?: string;
};

const TAB_LOCALES: Locale[] = ["fr", ...translatedLocales];

/**
 * Champs de contenu traduisible avec un onglet par langue.
 * Tous les champs restent dans le formulaire (seul l'onglet actif est visible),
 * donc les trois langues sont enregistrées en une seule fois.
 */
export function TranslationFields({ fields, values = {}, translations, gridClassName = "grid gap-3" }: Props) {
  const t = useTranslations("admin.translations");
  const [active, setActive] = useState<Locale>("fr");
  const baseId = useId();

  const isMissing = (locale: Locale) =>
    locale !== "fr" &&
    fields.some((field) => (values[field.name] ?? "").trim() !== "" && !translations?.[locale]?.[field.name]?.trim());

  return (
    <div className="rounded-xl border border-white/8 bg-white/2 p-3">
      <div role="tablist" aria-label={t("tabsLabel")} className="mb-3 flex flex-wrap gap-1.5">
        {TAB_LOCALES.map((locale) => (
          <button
            key={locale}
            id={`${baseId}-tab-${locale}`}
            type="button"
            role="tab"
            aria-selected={active === locale}
            aria-controls={`${baseId}-panel-${locale}`}
            onClick={() => setActive(locale)}
            className={`btn btn-sm ${active === locale ? "btn-primary" : "btn-ghost"}`}
          >
            <span lang={locale}>{t(locale)}</span>
            {isMissing(locale) ? (
              <span className="h-2 w-2 rounded-full bg-amber-400" title={t("missing")} aria-label={t("missing")} />
            ) : null}
          </button>
        ))}
      </div>

      {TAB_LOCALES.map((locale) => (
        <div
          key={locale}
          id={`${baseId}-panel-${locale}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${locale}`}
          hidden={active !== locale}
          lang={locale}
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <p className="mb-2 text-xs text-zinc-500">{locale === "fr" ? t("frHint") : t("otherHint")}</p>
          <div className={gridClassName}>
            {fields.map((field) => {
              const inputName = locale === "fr" ? field.name : `${field.name}_${locale}`;
              const defaultValue =
                locale === "fr" ? (values[field.name] ?? "") : (translations?.[locale]?.[field.name] ?? "");
              const inputId = `${baseId}-${inputName}`;
              const common = {
                id: inputId,
                name: inputName,
                defaultValue,
                maxLength: field.maxLength,
                placeholder: locale === "fr" ? field.placeholder : (values[field.name] ?? field.placeholder) || undefined,
                required: locale === "fr" && field.required,
                // Champ français obligatoire vide alors qu'un autre onglet est ouvert : on revient au français.
                onInvalid: locale === "fr" ? () => setActive("fr") : undefined,
              };
              return (
                <div key={field.name} className={field.className}>
                  <label className="label" htmlFor={inputId}>
                    {field.label}
                  </label>
                  {field.multiline ? (
                    <textarea {...common} className="textarea" />
                  ) : (
                    <input {...common} className="input" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
