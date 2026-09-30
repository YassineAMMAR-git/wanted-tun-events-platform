/**
 * Paramètres du paiement en ligne Mollie (paiement sur la page Mollie + activation automatique).
 *
 * Variables d'environnement :
 *   MOLLIE_API_KEY  clé d'API du profil de site Mollie : « test_… » (paiements fictifs) ou « live_… » (réels)
 *   APP_URL         adresse publique du site (retour du client après paiement et webhook)
 *
 * Sans MOLLIE_API_KEY, le site garde le paiement manuel (lien externe par offre + validation par l'administration).
 * Aucun webhook n'est à déclarer chez Mollie : son adresse est transmise avec chaque paiement.
 */

export type MollieMode = "test" | "live";

export function mollieApiKey(): string | null {
  const key = process.env.MOLLIE_API_KEY?.trim();
  return key && /^(test|live)_\w+$/.test(key) ? key : null;
}

/** Vrai dès qu'une clé d'API au bon format est renseignée. */
export function mollieConfigured(): boolean {
  return mollieApiKey() !== null;
}

export function mollieMode(): MollieMode {
  return mollieApiKey()?.startsWith("live_") ? "live" : "test";
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const mollieWebhookUrl = () => `${appUrl()}/api/mollie/webhook`;

/**
 * Mollie refuse un webhook qu'il ne peut pas joindre (poste de développement) : il est alors omis,
 * et le paiement est constaté au retour du client sur la page de paiement.
 */
export function webhookReachable(): boolean {
  try {
    const { protocol, hostname } = new URL(appUrl());
    return protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname) && !hostname.endsWith(".local");
  } catch {
    return false;
  }
}
