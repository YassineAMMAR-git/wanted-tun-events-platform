"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import type { FormState } from "@/lib/validation/form";

const initialState: FormState<"email"> = { status: "idle" };

/** Demande d'un lien de réinitialisation du mot de passe. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  const t = useTranslations("auth");
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <form action={formAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={180}
            autoComplete="email"
            defaultValue={state.values?.email ?? ""}
            className="input"
            {...fieldA11y("email", errors.email)}
          />
          <FieldError id="email-error" errors={errors.email} />
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={pending}>
          {pending ? t("forgot.submitting") : t("forgot.submit")}
        </button>
      </form>
    </div>
  );
}
