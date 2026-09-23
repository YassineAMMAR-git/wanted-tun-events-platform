import "server-only";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { renderEmailLayout, textToHtml } from "@/lib/emails/layout";
import type { Locale } from "@/i18n/config";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailResult = {
  status: "sent" | "simulated" | "failed";
  provider: string;
  error?: string;
};

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const DEFAULT_FROM = "WANTED TUN EVENTS <onboarding@resend.dev>";

export async function sendEmail(payload: MailPayload): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // En production, un e-mail « simulé » bloquerait silencieusement les inscriptions : on signale l'échec.
      console.error(`[mail] RESEND_API_KEY manquant : e-mail non envoyé → ${payload.to} — ${payload.subject}`);
      return { status: "failed", provider: "resend", error: "RESEND_API_KEY manquant : aucun e-mail ne peut être envoyé." };
    }
    // En développement, le contenu est affiché pour pouvoir suivre les liens (ex. confirmation de compte).
    console.info(`[mail:simulé] → ${payload.to} — ${payload.subject}\n${payload.text}\n[/mail:simulé]`);
    return { status: "simulated", provider: "journal-interne" };
  }

  const replyTo = process.env.MAIL_REPLY_TO?.trim();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const error = describeResendError(response.status, await response.text());
      console.error(`[mail] échec Resend → ${payload.to} — ${error}`);
      return { status: "failed", provider: "resend", error };
    }
    return { status: "sent", provider: "resend" };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Délai dépassé (10 s) en contactant Resend." : String(error);
    console.error(`[mail] échec Resend → ${payload.to} — ${message}`);
    return { status: "failed", provider: "resend", error: message.slice(0, 500) };
  }
}

/** Traduit les erreurs Resend les plus fréquentes en message exploitable (journal + console). */
function describeResendError(status: number, body: string): string {
  let message = body;
  try {
    message = (JSON.parse(body) as { message?: string }).message ?? body;
  } catch {
    // réponse non JSON : on garde le texte brut
  }
  const hints: Record<number, string> = {
    401: "Clé API invalide : vérifiez RESEND_API_KEY.",
    403: "Envoi refusé : vérifiez le domaine de MAIL_FROM dans Resend (avec onboarding@resend.dev, seul le propriétaire du compte peut recevoir).",
    422: "Données refusées : vérifiez le format de MAIL_FROM (ex. « Nom <no-reply@votre-domaine> ») et du destinataire.",
    429: "Limite d'envoi Resend atteinte : réessayez plus tard.",
  };
  const hint = hints[status] ? ` ${hints[status]}` : "";
  return `HTTP ${status} : ${message}.${hint}`.slice(0, 500);
}

type NotificationContext = {
  type: string;
  recipient: string;
  userId?: number | null;
  sessionId?: number | null;
  subscriptionId?: number | null;
  channel?: string;
};

export type LogNotificationInput = NotificationContext & {
  subject: string;
  body: string;
  /** Langue du destinataire (mise en page et sens de lecture). */
  locale?: Locale;
};

/** Notification en texte simple, mise en forme avec le gabarit commun puis journalisée. */
export async function logAndSend(input: LogNotificationInput): Promise<MailResult> {
  const html = renderEmailLayout({
    preheader: input.subject,
    title: input.subject,
    bodyHtml: textToHtml(input.body),
    signature: false,
    locale: input.locale,
  });
  return sendAndLog(input, { to: input.recipient, subject: input.subject, text: input.body, html }, input.body);
}

/**
 * E-mail déjà rendu (gabarit dédié). `logBody` remplace le contenu enregistré dans le journal
 * afin de ne jamais y conserver de lien sensible (jeton de vérification…).
 */
export async function sendTemplatedEmail(
  context: NotificationContext,
  email: { subject: string; text: string; html: string },
  logBody: string,
): Promise<MailResult> {
  return sendAndLog(context, { to: context.recipient, ...email }, logBody);
}

async function sendAndLog(context: NotificationContext, payload: MailPayload, logBody: string): Promise<MailResult> {
  const result = await sendEmail(payload);

  await db.insert(notifications).values({
    type: context.type,
    channel: context.channel ?? "email",
    recipient: context.recipient,
    subject: payload.subject,
    body: logBody,
    userId: context.userId ?? null,
    sessionId: context.sessionId ?? null,
    subscriptionId: context.subscriptionId ?? null,
    status: result.status,
    provider: result.provider,
    error: result.error ?? null,
    sentAt: result.status === "failed" ? null : new Date(),
  });

  return result;
}
