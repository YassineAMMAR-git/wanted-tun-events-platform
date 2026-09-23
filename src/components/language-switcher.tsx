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
        className="inline-flex items-center gap-0.5 rounded-full border border-white/12 bg-white/4 p-0.5"
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
                active ? "bg-amber-300 text-[#1a1305]" : "text-zinc-300 hover:bg-white/8 hover:text-white"
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
