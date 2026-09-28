import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/app/actions/locale";
import { localeNames, locales } from "@/i18n/config";

/** Sélecteur de langue : fonctionne aussi sans JavaScript (formulaire classique). */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations("language");

  return (
    <form action={setLocaleAction} className={className}>
      <div
        role="group"
        aria-label={t("label")}
        className="inline-flex items-center gap-0.5 rounded-full border border-zinc-300 bg-zinc-50 p-0.5"
      >
        <span aria-hidden className="px-1.5 text-sm">
          🌐
        </span>
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              lang={locale}
              aria-pressed={active}
              title={t("switchTo", { language: localeNames[locale].native })}
              className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                active ? "bg-gold text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {localeNames[locale].short}
            </button>
          );
        })}
      </div>
    </form>
  );
}
