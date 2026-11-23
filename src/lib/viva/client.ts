import "server-only";
import { vivaCredentials, vivaHosts, type VivaCredentials } from "@/lib/viva/config";

export class VivaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VivaError";
  }
}

function credentials(): VivaCredentials {
  const creds = vivaCredentials();
  if (!creds) throw new VivaError("Les variables VIVA_* ne sont pas toutes configurées.");
  return creds;
}

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

/**
 * Les codes de commande Viva ont 16 chiffres, à la limite des entiers exacts de JavaScript :
 * ils sont lus dans le texte brut de la réponse plutôt que via JSON.parse.
 */
export function readOrderCode(text: string, field = "orderCode"): string | null {
  return new RegExp(`"${field}"\\s*:\\s*"?(\\d{10,20})`, "i").exec(text)?.[1] ?? null;
}

async function request(url: string, init: RequestInit & { label: string }): Promise<string> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    // Les erreurs Viva portent un message dans « message » (API Smart Checkout) ou « ErrorText » (API historique).
    let detail = text.slice(0, 300);
    try {
      const json = JSON.parse(text) as { message?: string; ErrorText?: string; error?: string };
      detail = json.message ?? json.ErrorText ?? json.error ?? detail;
    } catch {}
    throw new VivaError(`${init.label} → ${response.status}: ${detail}`, response.status);
  }
  return text;
}

/** Jeton OAuth (valable une heure), gardé en mémoire jusqu'à une minute avant son expiration. */
let cachedToken: { value: string; expiresAt: number; clientId: string } | null = null;

export async function getAccessToken(): Promise<string> {
  const creds = credentials();
  if (cachedToken && cachedToken.clientId === creds.clientId && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const text = await request(`${vivaHosts().accounts}/connect/token`, {
    label: "POST /connect/token",
    method: "POST",
    headers: {
      Authorization: basic(creds.clientId, creds.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const json = JSON.parse(text) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max((json.expires_in ?? 3600) - 60, 60) * 1000,
    clientId: creds.clientId,
  };
  return json.access_token;
}

/** API Smart Checkout (jeton OAuth). */
async function api(method: "GET" | "POST", path: string, body?: unknown): Promise<string> {
  const token = await getAccessToken();
  return request(`${vivaHosts().api}${path}`, {
    label: `${method} ${path}`,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** API historique (identifiant marchand + clé d'API) : clé du webhook et transactions d'une commande. */
async function legacy(path: string): Promise<string> {
  const creds = credentials();
  return request(`${vivaHosts().web}${path}`, {
    label: `GET ${path}`,
    method: "GET",
    headers: { Authorization: basic(creds.merchantId, creds.apiKey), Accept: "application/json" },
  });
}

/** Durée de validité d'une page de paiement, en secondes. */
export const PAYMENT_TIMEOUT_SECONDS = 30 * 60;

/** Commande de paiement au montant fixé côté serveur ; renvoie son code (16 chiffres). */
export async function createOrder(input: {
  amountCents: number;
  description: string;
  merchantReference: string;
  customer: { email: string; fullName: string };
}): Promise<string> {
  const text = await api("POST", "/checkout/v2/orders", {
    amount: input.amountCents,
    customerTrns: input.description.slice(0, 255),
    merchantTrns: input.merchantReference.slice(0, 255),
    customer: { email: input.customer.email, fullName: input.customer.fullName.slice(0, 50), requestLang: "fr-FR" },
    paymentTimeout: PAYMENT_TIMEOUT_SECONDS,
    sourceCode: credentials().sourceCode,
  });
  const orderCode = readOrderCode(text);
  if (!orderCode) throw new VivaError(`Réponse de création de commande sans orderCode : ${text.slice(0, 200)}`);
  return orderCode;
}

/** Page Smart Checkout de la commande. */
export const checkoutUrl = (orderCode: string) => `${vivaHosts().web}/web/checkout?ref=${encodeURIComponent(orderCode)}`;

/**
 * Statut d'une transaction Viva : F = réussie, A = en cours, C = capturée (préautorisation),
 * E = refusée, X = annulée, R = remboursement ; les autres codes concernent les litiges.
 */
export type VivaTransaction = { id: string; orderCode: string | null; statusId: string; amountCents: number };

export async function getTransaction(transactionId: string): Promise<VivaTransaction> {
  const text = await api("GET", `/checkout/v2/transactions/${encodeURIComponent(transactionId)}`);
  const json = JSON.parse(text) as { statusId?: string; amount?: number };
  return {
    id: transactionId,
    orderCode: readOrderCode(text),
    statusId: String(json.statusId ?? ""),
    amountCents: Math.round(Number(json.amount ?? 0) * 100),
  };
}

/** Transactions d'une commande : sert quand le webhook et le retour du client ont tous deux été manqués. */
export async function listOrderTransactions(orderCode: string): Promise<VivaTransaction[]> {
  const text = await legacy(`/api/transactions/?ordercode=${encodeURIComponent(orderCode)}`);
  const json = JSON.parse(text) as {
    Transactions?: { TransactionId?: string; StatusId?: string; Amount?: number }[];
  };
  return (json.Transactions ?? [])
    .filter((item) => item.TransactionId)
    .map((item) => ({
      id: String(item.TransactionId),
      orderCode,
      statusId: String(item.StatusId ?? ""),
      amountCents: Math.round(Number(item.Amount ?? 0) * 100),
    }));
}

/** Clé que le webhook renvoie à Viva lors de sa vérification ; sert aussi à tester l'identifiant marchand et la clé d'API. */
export async function getWebhookKey(): Promise<string> {
  const text = await legacy("/api/messages/config/token");
  const key = (JSON.parse(text) as { Key?: string }).Key;
  if (!key) throw new VivaError("Réponse sans clé de webhook.");
  return key;
}
