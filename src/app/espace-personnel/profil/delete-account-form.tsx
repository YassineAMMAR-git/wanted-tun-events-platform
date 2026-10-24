"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteAccountAction } from "@/app/actions/auth";
import { FieldError, FormMessage, fieldA11y } from "@/components/form-feedback";
import { PASSWORD_MAX_LENGTH } from "@/lib/validation/constants";
import type { FormState } from "@/lib/validation/form";

const initialState: FormState<"password" | "confirmDelete"> = { status: "idle" };

/** Suppression du compte par son titulaire (droit à l'effacement), repliée par défaut. */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, initialState);
  const t = useTranslations("privacyCenter");
  const errors = state.fieldErrors ?? {};

  return (
    <details className="rounded-xl border border-rose-200 bg-rose-50/40 p-4" open={state.status === "error"}>
      <summary className="cursor-pointer text-sm font-semibold text-rose-700">{t("deleteTitle")}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-zinc-700">{t("deleteText")}</p>
        <FormMessage state={state} />
        <form action={formAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="delete-password">
              {t("deletePassword")}
            </label>
            <input
              id="delete-password"
              name="password"
              type="password"
              required
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="current-password"
              className="input"
              {...fieldA11y("delete-password", errors.password)}
            />
            <FieldError id="delete-password-error" errors={errors.password} />
          </div>
          <div>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="confirmDelete"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                {...fieldA11y("confirmDelete", errors.confirmDelete)}
              />
              <span>{t("deleteConfirm")}</span>
            </label>
            <FieldError id="confirmDelete-error" errors={errors.confirmDelete} />
          </div>
          <button className="btn btn-danger w-full sm:w-auto" type="submit" disabled={pending}>
            {pending ? t("deleting") : t("deleteSubmit")}
          </button>
        </form>
      </div>
    </details>
  );
}
