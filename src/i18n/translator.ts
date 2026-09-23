// "use-intl/core" : même traducteur que next-intl, sans dépendance à React (utilisable dans les scripts).
import { createTranslator } from "use-intl/core";
import type { Locale } from "@/i18n/config";
import { messages } from "@/i18n/messages";

/**
 * Traducteur utilisable hors du rendu d'une page (e-mails, tâches planifiées, scripts),
 * pour une langue donnée, par exemple celle du destinataire d'un e-mail.
 */
export function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: messages[locale] });
}
