import "server-only";
import { mollieApiKey } from "@/lib/mollie/config";

const API = "https://api.mollie.com/v2";

export class MollieError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MollieError";
  }
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = mollieApiKey();
  if (!key) throw new MollieError("MOLLIE_API_KEY n'est pas configurée.");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    // Les erreurs Mollie suivent le format « problem+json » : le champ detail est le plus parlant.
    let detail = text.slice(0, 300);
    try {
      detail = (JSON.parse(text) as { detail?: string }).detail ?? detail;
    } catch {}
    throw new MollieError(`${method} ${path} → ${response.status}: ${detail}`, response.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Statuts d'un paiement Mollie. */
export type MolliePaymentStatus = "open" | "pending" | "authorized" | "paid" | "canceled" | "expired" | "failed";

export type MolliePayment = {
  id: string;
  status: MolliePaymentStatus;
  amount: { value: string; currency: string };
  expiresAt?: string | null;
  _links: { checkout?: { href: string } | null };
};

/** Paiement unique au montant fixé côté serveur ; le client est renvoyé sur `redirectUrl` à la fin. */
export async function createPayment(input: {
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl?: string;
  metadata: Record<string, string | number>;
}): Promise<MolliePayment> {
  return api<MolliePayment>("POST", "/payments", {
    amount: { currency: "EUR", value: (input.amountCents / 100).toFixed(2) },
    description: input.description.slice(0, 255),
    redirectUrl: input.redirectUrl,
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    metadata: input.metadata,
  });
}

export async function getPayment(id: string): Promise<MolliePayment> {
  return api<MolliePayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

/** Moyens de paiement activés sur le profil : sert aussi à vérifier que la clé fonctionne. */
export async function listMethods(): Promise<{ id: string; description: string }[]> {
  const json = await api<{ _embedded?: { methods?: { id: string; description: string }[] } }>("GET", "/methods");
  return json._embedded?.methods ?? [];
}
