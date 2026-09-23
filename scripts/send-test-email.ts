/**
 * Envoie un vrai e-mail de test (gabarit de confirmation de compte) via Resend.
 *
 *   npm run email:test -- destinataire@exemple.fr [fr|en|ar]
 *
 * Le lien contenu dans l'e-mail est factice : il ne valide aucun compte.
 */
import "dotenv/config";
import { verificationEmail } from "@/lib/emails/account";
import { sendEmail } from "@/lib/mailer";
import { toLocale } from "@/i18n/config";

async function main() {
  const to = process.argv[2]?.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("Usage : npm run email:test -- destinataire@exemple.fr");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error("RESEND_API_KEY est vide dans .env : ajoutez votre clé Resend puis relancez.");
    process.exit(1);
  }

  const from = process.env.MAIL_FROM?.trim() || "WANTED TUN EVENTS <onboarding@resend.dev>";
  console.log(`Expéditeur : ${from}`);
  console.log(`Destinataire : ${to}`);

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const email = verificationEmail({
    firstName: "Test",
    verifyUrl: `${appUrl}/api/auth/verification-email?token=lien-de-test-non-valide`,
    validHours: 24,
    locale: toLocale(process.argv[3]),
  });

  const result = await sendEmail({ to, ...email, subject: `[TEST] ${email.subject}` });

  if (result.status === "sent") {
    console.log("✅ E-mail envoyé. Vérifiez la boîte de réception (et les courriers indésirables).");
    process.exit(0);
  }
  console.error(`❌ Échec : ${result.error ?? result.status}`);
  process.exit(1);
}

void main();
