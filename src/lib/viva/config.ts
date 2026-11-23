/**
 * Paramètres du paiement en ligne Viva (paiement sur la page Smart Checkout de Viva + activation automatique).
 *
 * Variables d'environnement :
 *   VIVA_ENV            « demo » (paiements fictifs, compte demo.vivapayments.com) ou « live » (paiements réels)
 *   VIVA_CLIENT_ID      identifiants OAuth « Smart Checkout » (Paramètres → Accès API)
 *   VIVA_CLIENT_SECRET
 *   VIVA_MERCHANT_ID    identifiant marchand et clé d'API (même écran) : clé du webhook et suivi des commandes
 *   VIVA_API_KEY
 *   VIVA_SOURCE_CODE    code à 4 chiffres de la source de paiement du site
 *   APP_URL             adresse publique du site (retour du client après paiement)
 *
 * Sans ces variables, le site garde le paiement manuel (lien externe par offre + validation par l'administration).
 * Contrairement à Mollie, l'adresse de retour et le webhook se déclarent une fois pour toutes dans l'espace Viva :
 * retour = APP_URL + /api/viva/retour (URL de succès et d'échec de la source), webhook = APP_URL + /api/viva/webhook.
 */

export type VivaMode = "demo" | "live";

export type VivaCredentials = {
  clientId: string;
  clientSecret: string;
  merchantId: string;
  apiKey: string;
  sourceCode: string;
};

const env = (name: string) => process.env[name]?.trim() || null;

export function vivaCredentials(): VivaCredentials | null {
  const clientId = env("VIVA_CLIENT_ID");
  const clientSecret = env("VIVA_CLIENT_SECRET");
  const merchantId = env("VIVA_MERCHANT_ID");
  const apiKey = env("VIVA_API_KEY");
  const sourceCode = env("VIVA_SOURCE_CODE");
  if (!clientId || !clientSecret || !merchantId || !apiKey || !sourceCode) return null;
  return { clientId, clientSecret, merchantId, apiKey, sourceCode };
}

/** Vrai dès que tous les identifiants Viva sont renseignés. */
export function vivaConfigured(): boolean {
  return vivaCredentials() !== null;
}

/** Mode démo par défaut : il faut écrire « live » pour encaisser de vrais paiements. */
export function vivaMode(): VivaMode {
  return env("VIVA_ENV")?.toLowerCase() === "live" ? "live" : "demo";
}

/** Adresses Viva du mode courant : jeton OAuth, API Smart Checkout, page de paiement et API historique. */
export function vivaHosts() {
  return vivaMode() === "live"
    ? {
        accounts: "https://accounts.vivapayments.com",
        api: "https://api.vivapayments.com",
        web: "https://www.vivapayments.com",
      }
    : {
        accounts: "https://demo-accounts.vivapayments.com",
        api: "https://demo-api.vivapayments.com",
        web: "https://demo.vivapayments.com",
      };
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const vivaReturnUrl = () => `${appUrl()}/api/viva/retour`;
export const vivaWebhookUrl = () => `${appUrl()}/api/viva/webhook`;
