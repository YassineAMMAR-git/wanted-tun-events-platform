import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, users, type User } from "@/db/schema";
import { EMAIL_VERIFICATION_RESEND_DELAY_MS, EMAIL_VERIFICATION_TTL_MS } from "@/lib/auth/constants";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { accountAlreadyExistsEmail, verificationEmail } from "@/lib/emails/account";
import { appUrl, sendTemplatedEmail } from "@/lib/mailer";
import { translatorFor } from "@/i18n/translator";

export type SendVerificationResult = "sent" | "throttled" | "already-verified";

/**
 * Génère un nouveau lien de confirmation (les précédents deviennent invalides) et l'envoie.
 * Limité à un envoi par minute par compte pour éviter l'utilisation abusive de la boîte mail.
 */
export async function sendVerificationEmail(
  user: Pick<User, "id" | "email" | "firstName" | "emailVerifiedAt" | "locale">,
): Promise<SendVerificationResult> {
  if (user.emailVerifiedAt) return "already-verified";

  const recent = (
    await db
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1)
  )[0];
  if (recent && Date.now() - recent.createdAt.getTime() < EMAIL_VERIFICATION_RESEND_DELAY_MS) return "throttled";

  const { token, tokenHash } = generateToken();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await tx.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
  });

  const verifyUrl = `${appUrl()}/api/auth/verification-email?token=${encodeURIComponent(token)}`;
  const email = verificationEmail({
    firstName: user.firstName,
    verifyUrl,
    validHours: Math.round(EMAIL_VERIFICATION_TTL_MS / 3_600_000),
    locale: user.locale,
  });

  await sendTemplatedEmail(
    { type: "email_verification", userId: user.id, recipient: user.email },
    email,
    // Journal rédigé en français (langue de référence de l'administration), sans le lien.
    translatorFor("fr")("emails.verification.log"),
  );
  return "sent";
}

/** Prévient le titulaire d'un compte existant qu'une inscription a été tentée avec son adresse. */
export async function sendAccountAlreadyExistsEmail(
  user: Pick<User, "id" | "email" | "firstName" | "locale">,
): Promise<void> {
  await sendTemplatedEmail(
    { type: "account_exists_notice", userId: user.id, recipient: user.email },
    accountAlreadyExistsEmail({ firstName: user.firstName, loginUrl: `${appUrl()}/connexion`, locale: user.locale }),
    translatorFor("fr")("emails.accountExists.log"),
  );
}

export type VerifyEmailResult = "verified" | "invalid" | "expired";

/** Consomme un jeton de vérification : active le compte si le jeton est valide et non expiré. */
export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  if (!token || token.length > 128) return "invalid";

  const row = (
    await db
      .select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId, expiresAt: emailVerificationTokens.expiresAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, hashToken(token)))
      .limit(1)
  )[0];

  if (!row) return "invalid";
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.id));
    return "expired";
  }

  return db.transaction(async (tx) => {
    // Suppression conditionnelle : si deux clics arrivent en même temps, un seul consomme le jeton.
    const consumed = await tx
      .delete(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.id, row.id), gt(emailVerificationTokens.expiresAt, new Date())))
      .returning({ id: emailVerificationTokens.id });
    if (consumed.length === 0) return "invalid";

    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId));
    return "verified";
  });
}
