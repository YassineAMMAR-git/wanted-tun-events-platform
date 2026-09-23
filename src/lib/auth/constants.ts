// Partagé entre le serveur et le proxy : ne doit importer aucun module serveur.

/** Le préfixe __Host- impose Secure + Path=/ sans domaine : réservé à la production (HTTPS). */
export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-wte_session" : "wte_session";

export const SESSION_TTL_MS = {
  client: 30 * 24 * 60 * 60 * 1000,
  admin: 12 * 60 * 60 * 1000,
} as const;

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
/** Délai minimum entre deux envois d'e-mail de vérification pour un même compte. */
export const EMAIL_VERIFICATION_RESEND_DELAY_MS = 60 * 1000;

/** Pages nécessitant une connexion (vérification optimiste dans le proxy). */
export const PROTECTED_PATH_PREFIXES = ["/admin", "/espace-personnel", "/abonnement/"] as const;
