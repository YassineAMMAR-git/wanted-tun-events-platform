"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import { ResendVerificationForm } from "@/app/connexion/resend-verification-form";
import { PASSWORD_MAX_LENGTH } from "@/lib/validation/constants";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const t = useTranslations("auth");
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <div>
          <label className="label" htmlFor="password">
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="current-password"
            className="input"
            {...fieldA11y("password", errors.password)}
          />
          <FieldError id="password-error" errors={errors.password} />
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={pending}>
          {pending ? t("login.submitting") : t("login.submit")}
        </button>
      </form>

      {state.unverifiedEmail ? <ResendVerificationForm email={state.unverifiedEmail} /> : null}
    </div>
  );
}
