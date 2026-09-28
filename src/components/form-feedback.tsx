import { useTranslations } from "next-intl";
import { translateKey } from "@/i18n/dynamic";
import { VALIDATION_MESSAGE_VALUES } from "@/lib/validation/constants";
import type { FormState } from "@/lib/validation/form";

/** Messages d'erreur d'un champ (clés de traduction), reliés à l'input via `aria-describedby`. */
export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  const t = useTranslations();
  if (!errors?.length) return null;
  return (
    <ul id={id} className="mt-1.5 space-y-0.5 text-xs text-rose-700" aria-live="polite">
      {errors.map((error) => (
        <li key={error}>{translateKey(t, error, VALIDATION_MESSAGE_VALUES, t("validation.invalid"))}</li>
      ))}
    </ul>
  );
}

/** Message global d'un formulaire (succès ou erreur). */
export function FormMessage({ state }: { state: Pick<FormState, "status" | "message" | "messageValues"> }) {
  const t = useTranslations();
  if (!state.message || state.status === "idle") return null;
  const isError = state.status === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        isError
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {isError ? "⚠️ " : "✅ "}
      {translateKey(t, state.message, state.messageValues, t("validation.invalid"))}
    </div>
  );
}

/** Attributs d'accessibilité d'un input selon ses erreurs. */
export function fieldA11y(name: string, errors?: string[]) {
  return errors?.length ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};
}
