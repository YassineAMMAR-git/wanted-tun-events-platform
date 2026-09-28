/**
 * Paramètres de l'intégration Qonto (paiement par lien + activation automatique).
 *
 * Variables d'environnement :
 *   QONTO_CLIENT_ID, QONTO_CLIENT_SECRET  identifiants de l'application OAuth (Developer Portal Qonto)
 *   QONTO_ENV                            « sandbox » ou « production » (défaut : production)
 *   QONTO_STAGING_TOKEN                  requis en sandbox uniquement (en-tête X-Qonto-Staging-Token)
 *   QONTO_VAT_RATE                       taux de TVA des lignes de paiement, ex. « 0 » ou « 0.2 » (défaut : 0)
 *   APP_URL                              adresse publique du site (retour OAuth et webhook)
 *
 * Sans QONTO_CLIENT_ID / QONTO_CLIENT_SECRET, l'intégration est désactivée et le site garde
 * le paiement manuel (lien externe par offre + validation par l'administration).
 */

export type QontoEnv = "sandbox" | "production";

export const QONTO_SCOPES = ["offline_access", "payment_link.read", "payment_link.write", "webhook"] as const;

export function qontoEnv(): QontoEnv {
  return process.env.QONTO_ENV === "sandbox" ? "sandbox" : "production";
}

/** Vrai dès que les identifiants OAuth sont configurés. */
export function qontoConfigured(): boolean {
  return Boolean(process.env.QONTO_CLIENT_ID && process.env.QONTO_CLIENT_SECRET);
}

export function qontoUrls() {
  return qontoEnv() === "sandbox"
    ? {
        api: "https://thirdparty-sandbox.staging.qonto.co",
        authorize: "https://oauth-sandbox.staging.qonto.co/oauth2/auth",
        token: "https://oauth-sandbox.staging.qonto.co/oauth2/token",
      }
    : {
        api: "https://thirdparty.qonto.com",
        authorize: "https://oauth.qonto.com/oauth2/auth",
        token: "https://oauth.qonto.com/oauth2/token",
      };
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const qontoRedirectUri = () => `${appUrl()}/api/qonto/callback`;
export const qontoWebhookUrl = () => `${appUrl()}/api/qonto/webhook`;

/** Taux de TVA transmis à Qonto sous forme de chaîne décimale (« 0 », « 0.2 »…). */
export function qontoVatRate(): string {
  const raw = Number(process.env.QONTO_VAT_RATE ?? "0");
  return Number.isFinite(raw) && raw >= 0 && raw < 1 ? String(raw) : "0";
}
