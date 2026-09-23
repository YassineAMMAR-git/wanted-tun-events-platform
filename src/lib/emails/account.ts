import "server-only";
import type { Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/translator";
import { escapeHtml, renderEmailLayout } from "@/lib/emails/layout";

export type RenderedEmail = { subject: string; text: string; html: string };

const panel = "margin:0 0 16px;padding:14px 16px;background:#faf7f0;border:1px solid #e7e2d6;border-radius:10px";

/** E-mail envoyé après la création d'un compte : bouton de confirmation de l'adresse e-mail. */
export function verificationEmail(params: {
  firstName: string;
  verifyUrl: string;
  validHours: number;
  locale: Locale;
}): RenderedEmail {
  const { firstName, verifyUrl, validHours, locale } = params;
  const t = translatorFor(locale);

  const text = [
    t("emails.hello", { name: firstName }),
    "",
    t("emails.verification.introText"),
    "",
    verifyUrl,
    "",
    t("emails.verification.validity", { hours: validHours }),
    "",
    t("emails.verification.next"),
    "",
    t("emails.verification.notYou"),
    "",
    t("emails.team"),
  ].join("\n");

  const html = renderEmailLayout({
    locale,
    preheader: t("emails.verification.preheader"),
    title: t("emails.verification.title"),
    bodyHtml: `
      <p style="margin:0 0 16px">${escapeHtml(t("emails.hello", { name: firstName }))}</p>
      <p style="margin:0 0 16px">${escapeHtml(t("emails.verification.intro"))}</p>`,
    cta: { label: t("emails.verification.button"), url: verifyUrl },
    afterCtaHtml: `
      <p style="${panel}">⏱️ ${escapeHtml(t("emails.verification.validity", { hours: validHours }))}</p>
      <p style="margin:0 0 6px">${escapeHtml(t("emails.verification.fallback"))}</p>
      <p dir="ltr" style="margin:0 0 16px;word-break:break-all;text-align:left"><a href="${escapeHtml(verifyUrl)}" style="color:#b8862f">${escapeHtml(verifyUrl)}</a></p>
      <p style="margin:0">${escapeHtml(t("emails.verification.next"))}</p>`,
    footerNote: t("emails.verification.notYou"),
  });

  return { subject: t("emails.verification.subject"), text, html };
}

/**
 * E-mail envoyé quand quelqu'un tente de créer un compte avec une adresse déjà inscrite.
 * Le formulaire affiche le même message dans tous les cas, pour ne pas révéler quelles adresses sont inscrites.
 */
export function accountAlreadyExistsEmail(params: { firstName: string; loginUrl: string; locale: Locale }): RenderedEmail {
  const { firstName, loginUrl, locale } = params;
  const t = translatorFor(locale);

  const text = [
    t("emails.hello", { name: firstName }),
    "",
    t("emails.accountExists.intro"),
    "",
    t("emails.accountExists.loginText", { url: loginUrl }),
    "",
    t("emails.accountExists.notYou"),
    "",
    t("emails.team"),
  ].join("\n");

  const html = renderEmailLayout({
    locale,
    preheader: t("emails.accountExists.preheader"),
    title: t("emails.accountExists.title"),
    bodyHtml: `
      <p style="margin:0 0 16px">${escapeHtml(t("emails.hello", { name: firstName }))}</p>
      <p style="margin:0 0 16px">${escapeHtml(t("emails.accountExists.intro"))}</p>`,
    cta: { label: t("emails.accountExists.button"), url: loginUrl },
    afterCtaHtml: `<p style="${panel}">🔒 ${escapeHtml(t("emails.accountExists.notYou"))}</p>`,
  });

  return { subject: t("emails.accountExists.subject"), text, html };
}
