"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  burnPasswordCheck,
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  revokeUserSessions,
  sendAccountAlreadyExistsEmail,
  sendVerificationEmail,
  verifyPassword,
} from "@/lib/auth";
import { LOGIN_LOCK_MS, LOGIN_MAX_ATTEMPTS } from "@/lib/auth/constants";
import { ensureSeeded } from "@/lib/seed";
import {
  LOGIN_FIELDS,
  PROFILE_FIELDS,
  REGISTER_FIELDS,
  RESEND_VERIFICATION_FIELDS,
  loginSchema,
  profileSchema,
  registerSchema,
  resendVerificationSchema,
} from "@/lib/validation/account";
import {
  type FormState,
  readFields,
  safeRedirectPath,
  validationErrorState,
  withoutSensitive,
} from "@/lib/validation/form";

type LoginField = (typeof LOGIN_FIELDS)[number];
export type LoginState = FormState<LoginField> & {
  /** Présent quand le mot de passe est correct mais l'adresse e-mail pas encore confirmée. */
  unverifiedEmail?: string;
};

const INVALID_CREDENTIALS = "forms.invalidCredentials";

/* --------------------------------- connexion -------------------------------- */

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  await ensureSeeded();
  const raw = readFields(formData, LOGIN_FIELDS);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, ["password"]);

  const { email, password } = parsed.data;
  const values = withoutSensitive(raw, ["password"]);
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (!user) {
    await burnPasswordCheck(password);
    return { status: "error", message: INVALID_CREDENTIALS, values };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return { status: "error", message: "forms.tooManyAttempts", messageValues: { minutes }, values };
  }

  const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= LOGIN_MAX_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + LOGIN_LOCK_MS) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));
    return {
      status: "error",
      message: locked ? "forms.accountLocked" : INVALID_CREDENTIALS,
      messageValues: locked ? { minutes: LOGIN_LOCK_MS / 60_000 } : undefined,
      values,
    };
  }

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      // La langue affichée au moment de la connexion devient celle des e-mails.
      locale: await getLocale(),
      ...(needsRehash ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(users.id, user.id));

  if (!user.emailVerifiedAt) {
    return {
      status: "error",
      message: "forms.notVerified",
      unverifiedEmail: user.email,
      values,
    };
  }

  await createSession(user);
  const fallback = user.role === "admin" ? "/admin" : "/espace-personnel";
  redirect(safeRedirectPath(parsed.data.next, fallback));
}

/* ------------------------------- inscription -------------------------------- */

type RegisterField = (typeof REGISTER_FIELDS)[number];
export type RegisterState = FormState<RegisterField> & { email?: string };

export async function registerAction(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  await ensureSeeded();
  const raw = readFields(formData, REGISTER_FIELDS);
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, ["password", "confirm"]);

  const data = parsed.data;
  // Hachage systématique : le temps de réponse est le même que l'adresse soit déjà inscrite ou non.
  const passwordHash = await hashPassword(data.password);
  const existing = (await db.select().from(users).where(eq(users.email, data.email)).limit(1))[0];

  if (existing) {
    if (existing.emailVerifiedAt) await sendAccountAlreadyExistsEmail(existing);
    else await sendVerificationEmail(existing);
  } else {
    const inserted = await db
      .insert(users)
      .values({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        city: data.city,
        passwordHash,
        role: "client",
        locale: await getLocale(),
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (inserted[0]) await sendVerificationEmail(inserted[0]);
  }

  // Réponse identique dans tous les cas : le formulaire ne révèle pas si une adresse est déjà inscrite.
  return { status: "success", email: data.email };
}

/* ----------------------- renvoi de l'e-mail de confirmation ----------------------- */

type ResendField = (typeof RESEND_VERIFICATION_FIELDS)[number];

export async function resendVerificationAction(_previous: FormState<ResendField>, formData: FormData): Promise<FormState<ResendField>> {
  const raw = readFields(formData, RESEND_VERIFICATION_FIELDS);
  const parsed = resendVerificationSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw);

  const user = (await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1))[0];
  if (user && !user.emailVerifiedAt) await sendVerificationEmail(user);

  return {
    status: "success",
    message: "forms.resendSent",
  };
}

/* --------------------------------- profil ---------------------------------- */

type ProfileField = (typeof PROFILE_FIELDS)[number];

export async function updateProfileAction(_previous: FormState<ProfileField>, formData: FormData): Promise<FormState<ProfileField>> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const sensitive = ["currentPassword", "newPassword", "confirm"] as const;
  const raw = readFields(formData, PROFILE_FIELDS);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, sensitive);

  const data = parsed.data;
  const changePassword = data.newPassword !== "";

  if (changePassword) {
    const { valid } = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!valid) {
      return {
        status: "error",
        message: "forms.fixErrors",
        fieldErrors: { currentPassword: ["forms.wrongCurrentPassword"] },
        values: withoutSensitive(raw, sensitive),
      };
    }
  }

  await db
    .update(users)
    .set({
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      city: data.city,
      ...(changePassword ? { passwordHash: await hashPassword(data.newPassword) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  if (changePassword) {
    // Déconnecte tous les autres appareils : un éventuel accès frauduleux est coupé.
    await revokeUserSessions(user.id, { keepCurrent: true });
  }

  revalidatePath("/espace-personnel/profil");
  return {
    status: "success",
    message: changePassword ? "forms.profileAndPasswordSaved" : "forms.profileSaved",
    values: withoutSensitive(raw, sensitive),
  };
}

/* -------------------------------- déconnexion -------------------------------- */

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
