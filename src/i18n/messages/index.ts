import type { Locale } from "@/i18n/config";
import fr from "@/i18n/messages/fr";
import en from "@/i18n/messages/en";
import ar from "@/i18n/messages/ar";

/** Structure de référence : celle du français. */
export type Messages = typeof fr;

export const messages: Record<Locale, Messages> = { fr, en, ar };
