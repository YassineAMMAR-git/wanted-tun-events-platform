"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileAction } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";
import type { FormState } from "@/lib/validation/form";

type ProfileField = "firstName" | "lastName" | "phone" | "city" | "currentPassword" | "newPassword" | "confirm";

type Props = {
  email: string;
  defaults: { firstName: string; lastName: string; phone: string; city: string };
};

const initialState: FormState<ProfileField> = { status: "idle" };

export function ProfileForm({ email, defaults }: Props) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);
  const t = useTranslations("profile");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const errors = state.fieldErrors ?? {};
  const values = { ...defaults, ...state.values };

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            {t("firstName")} *
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            maxLength={80}
            autoComplete="given-name"
            defaultValue={values.firstName}
            className="input"
            {...fieldA11y("firstName", errors.firstName)}
          />
          <FieldError id="firstName-error" errors={errors.firstName} />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            {t("lastName")} *
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            maxLength={80}
            autoComplete="family-name"
            defaultValue={values.lastName}
            className="input"
            {...fieldA11y("lastName", errors.lastName)}
          />
          <FieldError id="lastName-error" errors={errors.lastName} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="email">
            {t("emailLocked")}
          </label>
          <input id="email" type="email" defaultValue={email} disabled className="input opacity-60" />
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
            defaultValue={values.phone}
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
            defaultValue={values.city}
            className="input"
            {...fieldA11y("city", errors.city)}
          />
          <FieldError id="city-error" errors={errors.city} />
        </div>

        <fieldset className="grid gap-4 rounded-xl border border-white/8 p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-2 text-sm font-semibold text-zinc-200">{t("passwordSection")}</legend>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="currentPassword">
              {t("currentPassword")}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="current-password"
              className="input"
              {...fieldA11y("currentPassword", errors.currentPassword)}
            />
            <FieldError id="currentPassword-error" errors={errors.currentPassword} />
          </div>
          <div>
            <label className="label" htmlFor="newPassword">
              {t("newPassword")}
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              className="input"
              {...fieldA11y("newPassword", errors.newPassword)}
            />
            <FieldError id="newPassword-error" errors={errors.newPassword} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t("confirmPassword")}
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              className="input"
              {...fieldA11y("confirm", errors.confirm)}
            />
            <FieldError id="confirm-error" errors={errors.confirm} />
          </div>
          <p className="text-xs text-zinc-500 sm:col-span-2">
            🔒 {tAuth("passwordHint", { min: PASSWORD_MIN_LENGTH })} {t("passwordNote")}
          </p>
        </fieldset>

        <div className="flex gap-2 sm:col-span-2">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? t("saving") : tCommon("save")}
          </button>
          <Link href="/espace-personnel" className="btn btn-ghost">
            {tCommon("back")}
          </Link>
        </div>
      </form>
    </div>
  );
}
