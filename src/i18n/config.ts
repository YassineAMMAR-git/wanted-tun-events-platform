// Configuration des langues : partagée par le serveur, les composants client et le proxy.

export const locales = ["fr", "en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

/** Langue choisie par le visiteur (les URL restent identiques dans toutes les langues). */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeNames: Record<Locale, { short: string; native: string }> = {
  fr: { short: "FR", native: "Français" },
  en: { short: "EN", native: "English" },
  ar: { short: "AR", native: "العربية" },
};

/** Paramètres régionaux pour Intl : l'arabe utilise les chiffres occidentaux (usage courant en France). */
export const intlLocales: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-u-nu-latn",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Langues dans lesquelles le contenu (activités, offres…) peut être traduit en plus du français. */
export const translatedLocales = ["en", "ar"] as const satisfies readonly Exclude<Locale, "fr">[];
export type TranslatedLocale = (typeof translatedLocales)[number];
