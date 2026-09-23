import { z } from "zod";
import { USER_ROLES } from "@/db/schema";
import { locales } from "@/i18n/config";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/constants";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, VALIDATION_MESSAGE_VALUES } from "@/lib/validation/constants";

/*
 * Les messages d'erreur sont des clés de traduction (section « validation » de src/i18n/messages),
 * affichées dans la langue du visiteur par le composant FieldError.
 */

/* -------------------------------------------------------------------------- */
/* Règles de base                                                             */
/* -------------------------------------------------------------------------- */

/** Lettres (accents et alphabet arabe compris), espaces, apostrophes, points et tirets. */
const PERSON_NAME = /^\p{L}[\p{L}\p{M}' .\-]*$/u;
const CITY_NAME = /^\p{L}[\p{L}\p{M}0-9' .\-]*$/u;

const personName = (field: "firstName" | "lastName") =>
  z
    .string()
    .trim()
    .min(1, `validation.${field}Required`)
    .max(80, `validation.${field}TooLong`)
    .regex(PERSON_NAME, `validation.${field}Invalid`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "validation.emailRequired")
  .max(180, "validation.emailTooLong")
  .pipe(z.email("validation.emailInvalid"));

/**
 * Politique de mot de passe alignée sur les recommandations de la CNIL :
 * 12 caractères minimum mélangeant majuscules, minuscules, chiffres et caractères spéciaux.
 */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "validation.passwordTooShort")
  .max(PASSWORD_MAX_LENGTH, "validation.passwordTooLong")
  .regex(/\p{Ll}/u, "validation.passwordLowercase")
  .regex(/\p{Lu}/u, "validation.passwordUppercase")
  .regex(/\d/, "validation.passwordDigit")
  .regex(/[^\p{L}\d]/u, "validation.passwordSpecial");

/** Téléphone facultatif : format français (06…, +33…) ou international (+XX…). Normalisé à l'enregistrement. */
const optionalPhone = z
  .string()
  .trim()
  .max(25, "validation.phoneTooLong")
  .transform((value) => value.replace(/[\s.\-()]/g, ""))
  .refine(
    (value) => value === "" || /^(?:(?:\+|00)33|0)[1-9]\d{8}$/.test(value) || /^\+[1-9]\d{7,14}$/.test(value),
    "validation.phoneInvalid",
  )
  .transform((value) => (value === "" ? null : normalizePhone(value)));

const optionalCity = z
  .string()
  .trim()
  .max(120, "validation.cityTooLong")
  .refine((value) => value === "" || CITY_NAME.test(value), "validation.cityInvalid")
  .transform((value) => value || null);

function normalizePhone(value: string): string {
  const french = /^(?:(?:\+|00)33|0)([1-9])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (french) return `+33 ${french.slice(1).join(" ")}`;
  return value;
}

/* -------------------------------------------------------------------------- */
/* Formulaires                                                                */
/* -------------------------------------------------------------------------- */

export const LOGIN_FIELDS = ["email", "password", "next"] as const;
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.passwordRequired").max(PASSWORD_MAX_LENGTH, "validation.passwordTooLong"),
  next: z.string().max(300).optional(),
});

export const RESEND_VERIFICATION_FIELDS = ["email"] as const;
export const resendVerificationSchema = z.object({ email: emailSchema });

export const REGISTER_FIELDS = ["firstName", "lastName", "email", "phone", "city", "password", "confirm"] as const;
export const registerSchema = z
  .object({
    firstName: personName("firstName"),
    lastName: personName("lastName"),
    email: emailSchema,
    phone: optionalPhone,
    city: optionalCity,
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "validation.passwordMismatch",
  });

export const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "city",
  "currentPassword",
  "newPassword",
  "confirm",
] as const;
export const profileSchema = z
  .object({
    firstName: personName("firstName"),
    lastName: personName("lastName"),
    phone: optionalPhone,
    city: optionalCity,
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH),
    newPassword: z.string().max(PASSWORD_MAX_LENGTH),
    confirm: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword === "") return;
    for (const issue of newPasswordSchema.safeParse(data.newPassword).error?.issues ?? []) {
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: issue.message });
    }
    if (data.currentPassword === "") {
      ctx.addIssue({ code: "custom", path: ["currentPassword"], message: "validation.currentPasswordRequired" });
    }
    if (data.newPassword !== data.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "validation.passwordMismatch" });
    }
  });

const adminClientBase = {
  firstName: personName("firstName"),
  lastName: personName("lastName"),
  email: emailSchema,
  phone: optionalPhone,
  city: optionalCity,
  role: z.enum(USER_ROLES, "validation.roleInvalid"),
  locale: z.enum(locales, "validation.invalid").catch("fr"),
  notes: z
    .string()
    .trim()
    .max(2000, "validation.notesTooLong")
    .transform((value) => value || null),
};

export const ADMIN_CLIENT_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "role",
  "locale",
  "notes",
  "password",
] as const;

export const adminCreateClientSchema = z.object({
  ...adminClientBase,
  password: newPasswordSchema,
});

export const adminUpdateClientSchema = z.object({
  ...adminClientBase,
  id: z.coerce.number().int().positive("validation.clientNotFound"),
  password: z
    .string()
    .max(PASSWORD_MAX_LENGTH, "validation.passwordTooLong")
    .superRefine((value, ctx) => {
      if (value === "") return;
      for (const issue of newPasswordSchema.safeParse(value).error?.issues ?? []) {
        ctx.addIssue({ code: "custom", message: issue.message });
      }
    }),
});
