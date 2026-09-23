"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resendVerificationAction } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import type { FormState } from "@/lib/validation/form";

const initialState: FormState<"email"> = { status: "idle" };

/** Demande d'un nouveau lien de confirmation (lien expiré, e-mail non reçu…). */
export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, formAction, pending] = useActionState(resendVerificationAction, initialState);
  const t = useTranslations("auth");
  const errors = state.fieldErrors ?? {};

  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
      <p className="text-sm font-semibold text-amber-200">{t("resend.title")}</p>
      <p className="mt-1 text-xs text-zinc-400">{t("resend.text")}</p>
      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label className="sr-only" htmlFor="resend-email">
            {t("email")}
          </label>
          <input
            id="resend-email"
            name="email"
            type="email"
            required
            maxLength={180}
            autoComplete="email"
            defaultValue={state.values?.email ?? email ?? ""}
            placeholder={t("resend.placeholder")}
            className="input"
            {...fieldA11y("resend-email", errors.email)}
          />
          <FieldError id="resend-email-error" errors={errors.email} />
        </div>
        <button className="btn btn-ghost sm:w-auto" type="submit" disabled={pending}>
          {pending ? t("resend.submitting") : t("resend.submit")}
        </button>
      </form>
      {state.status === "success" ? (
        <div className="mt-3">
          <FormMessage state={state} />
        </div>
      ) : null}
    </div>
  );
}
