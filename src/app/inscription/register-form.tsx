"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registerAction, type RegisterState } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";

const initialState: RegisterState = { status: "idle" };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const t = useTranslations("auth.register");
  const tAuth = useTranslations("auth");
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-center" role="status">
        <p className="text-4xl">📬</p>
        <h2 className="text-xl font-bold text-white">{t("successTitle")}</h2>
        <p className="text-sm text-zinc-300">
          {t.rich("successText", {
            email: state.email ?? "",
            strong: (chunks) => <strong className="text-amber-200">{chunks}</strong>,
          })}
        </p>
        <p className="text-xs text-zinc-500">{t("successHint")}</p>
        <Link href="/connexion" className="btn btn-ghost w-full">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            {t("firstName")}
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            maxLength={80}
            autoComplete="given-name"
            defaultValue={values.firstName ?? ""}
            className="input"
            {...fieldA11y("firstName", errors.firstName)}
          />
          <FieldError id="firstName-error" errors={errors.firstName} />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            {t("lastName")}
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            maxLength={80}
            autoComplete="family-name"
            defaultValue={values.lastName ?? ""}
            className="input"
            {...fieldA11y("lastName", errors.lastName)}
          />
          <FieldError id="lastName-error" errors={errors.lastName} />
        </div>
        <div className="sm:col-span-2">
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
            defaultValue={values.email ?? ""}
            className="input"
            {...fieldA11y("email", errors.email)}
          />
          <FieldError id="email-error" errors={errors.email} />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            {t("phone")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={25}
            autoComplete="tel"
            placeholder={tAuth("phonePlaceholder")}
            defaultValue={values.phone ?? ""}
            className="input"
            {...fieldA11y("phone", errors.phone)}
          />
          <FieldError id="phone-error" errors={errors.phone} />
        </div>
        <div>
          <label className="label" htmlFor="city">
            {t("city")}
          </label>
          <input
            id="city"
            name="city"
            maxLength={120}
            autoComplete="address-level2"
            placeholder={tAuth("cityPlaceholder")}
            defaultValue={values.city ?? ""}
            className="input"
            {...fieldA11y("city", errors.city)}
          />
          <FieldError id="city-error" errors={errors.city} />
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
            {t("confirm")}
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
        <p className="text-xs text-zinc-500 sm:col-span-2">🔒 {tAuth("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
        <div className="sm:col-span-2">
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
