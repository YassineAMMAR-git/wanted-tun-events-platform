import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { qontoConnection, type QontoConnection } from "@/db/schema";
import { qontoEnv, qontoRedirectUri, qontoUrls } from "@/lib/qonto/config";

export class QontoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QontoError";
  }
}

/* -------------------------------------------------------------------------- */
/* Chiffrement des jetons en base                                             */
/* -------------------------------------------------------------------------- */

const key = () => createHash("sha256").update(`qonto:${process.env.QONTO_CLIENT_SECRET ?? ""}`).digest();

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

function decrypt(value: string): string {
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/* -------------------------------------------------------------------------- */
/* OAuth                                                                      */
/* -------------------------------------------------------------------------- */

const CONNECTION_ID = 1;
/** Jeton d'accès renouvelé un peu avant son expiration (1 h). */
const ACCESS_TOKEN_MARGIN_MS = 2 * 60 * 1000;
/** Jeton de renouvellement valable 90 jours : on compte un jour de moins par prudence. */
const REFRESH_TOKEN_TTL_MS = 89 * 24 * 60 * 60 * 1000;

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

function sandboxHeaders(): Record<string, string> {
  const token = process.env.QONTO_STAGING_TOKEN;
  return qontoEnv() === "sandbox" && token ? { "X-Qonto-Staging-Token": token } : {};
}

async function requestTokens(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(qontoUrls().token, {
    method: "POST",
    // Qonto exige client_id et client_secret dans le corps (pas d'en-tête Authorization: Basic).
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...sandboxHeaders() },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.QONTO_CLIENT_ID ?? "",
      client_secret: process.env.QONTO_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new QontoError(`OAuth ${response.status}: ${text.slice(0, 300)}`, response.status);
  const json = JSON.parse(text) as TokenResponse;
  if (!json.access_token || !json.refresh_token) {
    throw new QontoError("Réponse OAuth sans refresh_token (le scope offline_access est-il accordé ?)");
  }
  return json;
}

function tokenValues(tokens: TokenResponse) {
  const now = Date.now();
  return {
    accessToken: encrypt(tokens.access_token),
    accessTokenExpiresAt: new Date(now + (tokens.expires_in ?? 3600) * 1000),
    refreshToken: encrypt(tokens.refresh_token!),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    lastError: null,
    updatedAt: new Date(),
  };
}

/** Échange le code reçu au retour de Qonto contre les jetons, et les enregistre. */
export async function connectWithCode(code: string): Promise<void> {
  const tokens = await requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: qontoRedirectUri(),
  });
  const values = tokenValues(tokens);
  await db
    .insert(qontoConnection)
    .values({ id: CONNECTION_ID, ...values, connectedAt: new Date() })
    .onConflictDoUpdate({ target: qontoConnection.id, set: { ...values, connectedAt: new Date() } });
}

export async function getConnection(): Promise<QontoConnection | null> {
  return (await db.select().from(qontoConnection).where(eq(qontoConnection.id, CONNECTION_ID)).limit(1))[0] ?? null;
}

export async function disconnect(): Promise<void> {
  await db.delete(qontoConnection).where(eq(qontoConnection.id, CONNECTION_ID));
}

/**
 * Jeton d'accès valide, renouvelé si besoin.
 * Le jeton de renouvellement n'est utilisable qu'une fois : la ligne est verrouillée (FOR UPDATE)
 * pour que deux requêtes simultanées ne le consomment pas en même temps.
 */
export async function getAccessToken(options: { force?: boolean } = {}): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      const row = (
        await tx.select().from(qontoConnection).where(eq(qontoConnection.id, CONNECTION_ID)).for("update")
      )[0];
      if (!row) throw new QontoError("Qonto n'est pas connecté.");

      if (!options.force && row.accessTokenExpiresAt.getTime() - ACCESS_TOKEN_MARGIN_MS > Date.now()) {
        return decrypt(row.accessToken);
      }

      const tokens = await requestTokens({ grant_type: "refresh_token", refresh_token: decrypt(row.refreshToken) });
      await tx.update(qontoConnection).set(tokenValues(tokens)).where(eq(qontoConnection.id, CONNECTION_ID));
      return tokens.access_token;
    });
  } catch (error) {
    // Enregistrée après l'annulation de la transaction, pour être affichée dans l'administration.
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(qontoConnection)
      .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(qontoConnection.id, CONNECTION_ID))
      .catch(() => undefined);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Appels à l'API                                                             */
/* -------------------------------------------------------------------------- */

async function api<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getAccessToken({ force: retried });
  const response = await fetch(`${qontoUrls().api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...sandboxHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  // Jeton révoqué ou expiré plus tôt que prévu : un seul nouvel essai avec un jeton renouvelé.
  if (response.status === 401 && !retried) return api<T>(method, path, body, true);
  const text = await response.text();
  if (!response.ok) throw new QontoError(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`, response.status);
  return (text ? JSON.parse(text) : {}) as T;
}

export type PaymentLinkStatus = "open" | "processing" | "paid" | "expired" | "canceled";

export type QontoPaymentLink = {
  id: string;
  status: PaymentLinkStatus;
  url: string;
  expiration_date?: string | null;
};

/** Certaines réponses sont enveloppées ({ payment_link: … }), d'autres non : on accepte les deux. */
function unwrap<T>(json: unknown, key: string): T {
  const record = json as Record<string, unknown>;
  return (record && typeof record === "object" && key in record ? record[key] : record) as T;
}

export type ConnectionStatus = "enabled" | "pending" | "disabled" | "not_connected";

export async function getPaymentLinksConnection(): Promise<{ status: ConnectionStatus; connection_location?: string }> {
  return unwrap(await api("GET", "/v2/payment_links/connections"), "connection");
}

/** Lien à usage unique pour un seul article (l'abonnement), au prix fixé côté serveur. */
export async function createPaymentLink(input: {
  title: string;
  description?: string;
  amountCents: number;
  vatRate: string;
}): Promise<QontoPaymentLink> {
  const json = await api("POST", "/v2/payment_links", {
    payment_link: {
      potential_payment_methods: ["credit_card", "apple_pay", "paypal"],
      reusable: false,
      items: [
        {
          title: input.title.slice(0, 120),
          ...(input.description ? { description: input.description.slice(0, 250) } : {}),
          quantity: 1,
          unit_price: { value: (input.amountCents / 100).toFixed(2), currency: "EUR" },
          vat_rate: input.vatRate,
        },
      ],
    },
  });
  return unwrap<QontoPaymentLink>(json, "payment_link");
}

export async function getPaymentLink(id: string): Promise<QontoPaymentLink> {
  return unwrap<QontoPaymentLink>(await api("GET", `/v2/payment_links/${encodeURIComponent(id)}`), "payment_link");
}

/** Abonne le site aux événements « liens de paiement » ; le secret n'est renvoyé qu'une seule fois. */
export async function registerWebhook(callbackUrl: string): Promise<void> {
  const connection = await getConnection();
  if (connection?.webhookSubscriptionId) {
    await api("DELETE", `/v2/webhook_subscriptions/${encodeURIComponent(connection.webhookSubscriptionId)}`).catch(
      () => undefined,
    );
  }
  const secret = randomBytes(32).toString("hex");
  const json = await api("POST", "/v2/webhook_subscriptions", {
    callback_url: callbackUrl,
    types: ["v1/payment-links"],
    secret,
    description: "WANTED TUN EVENTS — activation automatique des abonnements",
  });
  const created = unwrap<{ id?: string; secret?: string }>(json, "webhook_subscription");
  await db
    .update(qontoConnection)
    .set({
      webhookSubscriptionId: created.id ?? null,
      webhookSecret: encrypt(created.secret ?? secret),
      updatedAt: new Date(),
    })
    .where(eq(qontoConnection.id, CONNECTION_ID));
}

/**
 * Vérifie l'en-tête X-Qonto-Signature (« t=…,v1=… ») : HMAC-SHA256 hexadécimal de « {t}.{corps brut} ».
 */
export async function verifyWebhookSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const connection = await getConnection();
  if (!connection?.webhookSecret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  if (!parts.t || !parts.v1) return false;

  const expected = createHmac("sha256", decrypt(connection.webhookSecret)).update(`${parts.t}.${rawBody}`).digest();
  const provided = Buffer.from(parts.v1, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
