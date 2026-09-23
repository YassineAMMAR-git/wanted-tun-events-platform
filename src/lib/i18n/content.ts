import { translatedLocales, type Locale, type TranslatedLocale } from "@/i18n/config";
import type { ContentTranslations } from "@/db/schema";

type Translatable<Field extends string> = { [K in Field]: string | null } & {
  translations: ContentTranslations<Field> | null;
};

/**
 * Renvoie une copie du contenu dans la langue demandée.
 * Chaque champ non traduit (absent ou vide) garde sa valeur française.
 */
export function localize<Field extends string, Row extends Translatable<Field>>(
  row: Row,
  locale: Locale,
  fields: readonly Field[],
): Row {
  if (locale === "fr") return row;
  const translation = row.translations?.[locale];
  if (!translation) return row;
  const result = { ...row };
  for (const field of fields) {
    const value = translation[field]?.trim();
    if (value) (result as Record<string, unknown>)[field] = value;
  }
  return result;
}

/** Nom du champ de formulaire pour une traduction : `name` (fr), `name_en`, `name_ar`. */
export function translationFieldName(field: string, locale: TranslatedLocale): string {
  return `${field}_${locale}`;
}

/** Lit les champs traduits (`name_en`, `name_ar`…) d'un formulaire d'administration. */
export function readTranslations<Field extends string>(
  formData: FormData,
  fields: readonly Field[],
  maxLength = 5000,
): ContentTranslations<Field> {
  const result: ContentTranslations<Field> = {};
  for (const locale of translatedLocales) {
    const values: Partial<Record<Field, string>> = {};
    for (const field of fields) {
      const raw = formData.get(translationFieldName(field, locale));
      const value = typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
      if (value) values[field] = value;
    }
    if (Object.keys(values).length > 0) result[locale] = values;
  }
  return result;
}
