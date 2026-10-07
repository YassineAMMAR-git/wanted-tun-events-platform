"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resetPasswordAction, type ResetPasswordState } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";

const initialState: ResetPasswordState = { status: "idle" };

/** Choix d'un nouveau mot de passe, à partir du lien reçu par e-mail. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const t = useTranslations("auth");
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">
            {t("reset.newPassword")}
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
            {...fieldA11y("password", errors.password)}
          />
          <FieldError id="password-error" errors={errors.password} />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            {t("reset.confirm")}
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            className="input"
            {...fieldA11y("confirm", errors.confirm)}
          />
          <FieldError id="confirm-error" errors={errors.confirm} />
        </div>
        <p className="text-xs text-zinc-500">🔒 {t("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
        <button className="btn btn-primary w-full" type="submit" disabled={pending}>
          {pending ? t("reset.submitting") : t("reset.submit")}
        </button>
      </form>
    </div>
  );
}
