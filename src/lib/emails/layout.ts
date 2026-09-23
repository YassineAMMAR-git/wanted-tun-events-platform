import "server-only";
import { defaultLocale, localeDirection, type Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/translator";

export const BRAND_NAME = "WANTED TUN EVENTS";

const colors = {
  page: "#f4f1ea",
  card: "#ffffff",
  header: "#0b0b0d",
  gold: "#e0b25c",
  goldDark: "#b8862f",
  heading: "#18181b",
  text: "#3f3f46",
  muted: "#71717a",
  border: "#e7e2d6",
  panel: "#faf7f0",
};

const fontStack = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Échappe une valeur avant de l'insérer dans du HTML (noms, adresses saisis par les utilisateurs…). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texte brut (avec retours à la ligne) → paragraphes HTML échappés. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export type EmailLayoutOptions = {
  /** Aperçu affiché à côté de l'objet dans la boîte de réception. */
  preheader: string;
  title: string;
  /** Contenu HTML déjà échappé. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Contenu HTML déjà échappé, affiché sous le bouton. */
  afterCtaHtml?: string;
  footerNote?: string;
  /** Signature « L'équipe … » ajoutée en bas du message (désactivée si le texte la contient déjà). */
  signature?: boolean;
  /** Langue du destinataire : textes communs (signature, pied de page) et sens de lecture. */
  locale?: Locale;
};

/** Gabarit commun à tous les e-mails : tableaux et styles en ligne pour la compatibilité (Outlook, Gmail…). */
export function renderEmailLayout({
  preheader,
  title,
  bodyHtml,
  cta,
  afterCtaHtml,
  footerNote,
  signature = true,
  locale = defaultLocale,
}: EmailLayoutOptions): string {
  const t = translatorFor(locale);
  const dir = localeDirection(locale);
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html>
<html lang="${locale}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body dir="${dir}" style="margin:0;padding:0;background:${colors.page};-webkit-text-size-adjust:100%;text-align:${align}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.page}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${colors.card};border:1px solid ${colors.border};border-radius:16px;overflow:hidden">
          <tr>
            <td dir="ltr" style="background:${colors.header};padding:28px 36px;border-bottom:3px solid ${colors.gold};text-align:${align}">
              <span style="font-family:${fontStack};font-size:14px;font-weight:800;letter-spacing:4px;color:#ffffff">WANTED</span>
              <span style="font-family:${fontStack};font-size:14px;font-weight:600;letter-spacing:4px;color:${colors.gold}">&nbsp;TUN EVENTS</span>
            </td>
          </tr>
          <tr>
            <td dir="${dir}" style="padding:40px 36px 8px;font-family:${fontStack};text-align:${align}">
              <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;font-weight:700;color:${colors.heading}">${escapeHtml(title)}</h1>
              <div style="font-size:16px;line-height:1.65;color:${colors.text}">${bodyHtml}</div>
            </td>
          </tr>
          ${cta ? renderButton(cta) : ""}
          ${afterCtaHtml ? `<tr><td dir="${dir}" style="padding:8px 36px 8px;font-family:${fontStack};font-size:14px;line-height:1.6;color:${colors.muted};text-align:${align}">${afterCtaHtml}</td></tr>` : ""}
          ${
            signature
              ? `<tr>
            <td dir="${dir}" style="padding:24px 36px 36px;font-family:${fontStack};text-align:${align}">
              <p style="margin:0;font-size:15px;line-height:1.6;color:${colors.text}">${escapeHtml(t("emails.signature"))}<br /><strong style="color:${colors.heading}">${escapeHtml(t("emails.team"))}</strong></p>
            </td>
          </tr>`
              : `<tr><td style="padding:0 0 20px"></td></tr>`
          }
          <tr>
            <td dir="${dir}" style="background:${colors.panel};border-top:1px solid ${colors.border};padding:20px 36px;font-family:${fontStack};font-size:12px;line-height:1.6;color:${colors.muted};text-align:${align}">
              ${footerNote ? `${escapeHtml(footerNote)}<br />` : ""}
              ${escapeHtml(t("emails.autoNotice"))}<br />
              ${escapeHtml(t("emails.footer", { year: new Date().getFullYear() }))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderButton({ label, url }: { label: string; url: string }): string {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return `<tr>
            <td align="center" style="padding:12px 36px 24px">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:52px;v-text-anchor:middle;width:320px" arcsize="50%" stroke="f" fillcolor="${colors.gold}">
                <center style="color:#141109;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;background:${colors.gold};border:1px solid ${colors.goldDark};color:#141109;font-family:${fontStack};font-size:16px;font-weight:700;line-height:52px;padding:0 36px;border-radius:999px;text-decoration:none">${text}</a>
              <!--<![endif]-->
            </td>
          </tr>`;
}
