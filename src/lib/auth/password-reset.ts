import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, userSessions, users, type User } from "@/db/schema";
import { PASSWORD_RESET_RESEND_DELAY_MS, PASSWORD_RESET_TTL_MS } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { passwordResetEmail } from "@/lib/emails/account";
import { appUrl, logAndSend, sendTemplatedEmail } from "@/lib/mailer";
import { translatorFor } from "@/i18n/translator";

/**
 * Envoie un lien de réinitialisation à usage unique (les précédents deviennent invalides).
 * Limité à un envoi par minute par compte. Ne dit jamais à l'appelant si l'adresse existe.
 */
export async function sendPasswordResetEmail(
  user: Pick<User, "id" | "email" | "firstName" | "locale">,
): Promise<"sent" | "throttled"> {
  const recent = (
    await db
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1)
  )[0];
  if (recent && Date.now() - recent.createdAt.getTime() < PASSWORD_RESET_RESEND_DELAY_MS) return "throttled";

  const { token, tokenHash } = generateToken();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
  });

  const resetUrl = `${appUrl()}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
  await sendTemplatedEmail(
    { type: "password_reset", userId: user.id, recipient: user.email },
    passwordResetEmail({
      firstName: user.firstName,
      resetUrl,
      validMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60_000),
      locale: user.locale,
    }),
    // Journal en français, sans le lien : il donne accès au compte.
    translatorFor("fr")("emails.passwordReset.log"),
  );
  return "sent";
}

export type ResetTokenState = "valid" | "invalid" | "expired";

/** État d'un lien de réinitialisation, sans le consommer (affichage du formulaire). */
export async function checkPasswordResetToken(token: string): Promise<ResetTokenState> {
  if (!token || token.length > 128) return "invalid";
  const row = (
    await db
      .select({ expiresAt: passwordResetTokens.expiresAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
      .limit(1)
      .catch((error) => {
        console.error("[auth] lecture du lien de réinitialisation impossible", error);
        return [];
      })
  )[0];
  if (!row) return "invalid";
  return row.expiresAt.getTime() > Date.now() ? "valid" : "expired";
}

/**
 * Consomme le lien et enregistre le nouveau mot de passe.
 * Le compte est débloqué, toutes ses sessions sont fermées, et l'adresse est considérée comme confirmée
 * (le titulaire vient de prouver qu'il reçoit bien les e-mails).
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<ResetTokenState> {
  const state = await checkPasswordResetToken(token);
  if (state !== "valid") return state;
  const passwordHash = await hashPassword(newPassword);

  const user = await db.transaction(async (tx) => {
    // Suppression conditionnelle : si le lien est utilisé deux fois en même temps, un seul passage aboutit.
    const consumed = await tx
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ userId: passwordResetTokens.userId });
    if (!consumed[0]) return null;
    const { userId } = consumed[0];

    const [updated] = await tx
      .update(users)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, firstName: users.firstName, locale: users.locale });
    await tx.delete(userSessions).where(eq(userSessions.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    return updated ?? null;
  });
  if (!user) return "invalid";

  // Le titulaire est prévenu : si ce n'est pas lui, il sait qu'il doit réagir.
  const t = translatorFor(user.locale);
  await logAndSend({
    type: "password_changed",
    userId: user.id,
    recipient: user.email,
    locale: user.locale,
    subject: t("emails.passwordChanged.subject"),
    body: [
      t("emails.hello", { name: user.firstName }),
      "",
      t("emails.passwordChanged.text"),
      "",
      t("emails.passwordChanged.notYou"),
      `${appUrl()}/mot-de-passe-oublie`,
      "",
      t("emails.team"),
    ].join("\n"),
  }).catch((error) => console.error("[mail] avis de changement de mot de passe non envoyé", error));

  return "valid";
}
