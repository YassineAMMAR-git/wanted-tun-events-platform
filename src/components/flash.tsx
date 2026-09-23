import { useTranslations } from "next-intl";
import { translateKey } from "@/i18n/dynamic";

/**
 * Bandeau affiché après une action d'administration.
 * `ok` et `erreur` sont des clés de la section « admin.flash » (ou « validation ») passées dans l'URL.
 */
export function Flash({ ok, erreur }: { ok?: string; erreur?: string }) {
  const t = useTranslations();
  if (!ok && !erreur) return null;

  const key = erreur ?? ok ?? "";
  const fullKey = key.includes(".") ? key : `admin.flash.${key}`;
  const text = translateKey(t, fullKey, { min: 12, max: 128 }, erreur ? t("validation.invalid") : t("common.save"));

  return (
    <div
      role={erreur ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        erreur
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      }`}
    >
      {erreur ? `⚠️ ${text}` : `✅ ${text}`}
    </div>
  );
}
