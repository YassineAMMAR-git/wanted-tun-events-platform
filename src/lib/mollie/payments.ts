import "server-only";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  paymentLinks,
  plans,
  sessions,
  subscriptions,
  ticketPrices,
  users,
  type PaymentLink,
} from "@/db/schema";
import { activateSubscription } from "@/lib/subscriptions";
import { createPayment, getPayment, type MolliePaymentStatus } from "@/lib/mollie/client";
import { appUrl, mollieConfigured, mollieWebhookUrl, webhookReachable } from "@/lib/mollie/config";
import { formatDateTime } from "@/lib/format";

/** Statuts enregistrés en base (colonne payment_links.status). */
export type PaymentLinkStatus = "open" | "processing" | "paid" | "expired" | "canceled";

/** « pending » / « authorized » : payé côté client, confirmation en cours ; « failed » : refusé, à retenter. */
function toLinkStatus(status: MolliePaymentStatus): PaymentLinkStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "pending":
    case "authorized":
      return "processing";
    case "expired":
      return "expired";
    case "canceled":
    case "failed":
      return "canceled";
    default:
      return "open";
  }
}

/** Statuts après lesquels un paiement n'évolue plus. */
const FINAL: PaymentLinkStatus[] = ["paid", "expired", "canceled"];
const isFinal = (status: string) => (FINAL as string[]).includes(status);

/** Paiement sur lequel le client peut encore payer (ouvert et non expiré) ou dont la confirmation est en cours. */
export function isLinkUsable(link: PaymentLink | null): boolean {
  if (!link) return false;
  if (link.status === "processing") return true;
  return link.status === "open" && (!link.expiresAt || link.expiresAt.getTime() > Date.now());
}

/** Paiement en ligne actif : clé Mollie renseignée. */
export async function onlinePaymentsEnabled(): Promise<boolean> {
  return mollieConfigured();
}

/**
 * Passe la commande en « payée » une seule fois, même si le webhook, la page de retour
 * et la tâche quotidienne constatent le paiement en même temps.
 */
async function claimAndActivate(subscriptionId: number): Promise<boolean> {
  const claimed = await db
    .update(subscriptions)
    .set({ paymentStatus: "paid" })
    .where(and(eq(subscriptions.id, subscriptionId), ne(subscriptions.paymentStatus, "paid")))
    .returning({ id: subscriptions.id });
  if (!claimed[0]) return false;
  await activateSubscription(subscriptionId);
  return true;
}

/** Relit le paiement chez Mollie (jamais sur la seule foi d'un webhook) et active la commande s'il est payé. */
export async function syncPaymentLink(link: PaymentLink): Promise<PaymentLink> {
  const remote = await getPayment(link.externalId);
  const status = toLinkStatus(remote.status);
  const [updated] = await db
    .update(paymentLinks)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentLinks.id, link.id))
    .returning();
  if (status === "paid") {
    await alignTicketWithPayment(link);
    await claimAndActivate(link.subscriptionId);
  }
  return updated ?? { ...link, status };
}

/**
 * Le client a pu changer de tarif après avoir ouvert une première page de paiement, puis payer celle-ci :
 * le billet reprend alors le tarif réellement payé (jamais un tarif plus cher que le montant encaissé).
 */
async function alignTicketWithPayment(link: PaymentLink): Promise<void> {
  const ticket = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, link.subscriptionId), eq(subscriptions.kind, "ticket")))
      .limit(1)
  )[0];
  if (!ticket || ticket.amountCents === null || ticket.amountCents === link.amountCents) return;

  const paidTier = (
    await db
      .select({ name: ticketPrices.name })
      .from(ticketPrices)
      .where(and(eq(ticketPrices.activityId, ticket.activityId), eq(ticketPrices.priceCents, link.amountCents)))
      .limit(1)
  )[0];
  await db
    .update(subscriptions)
    .set({ amountCents: link.amountCents, priceLabel: paidTier?.name ?? null })
    .where(eq(subscriptions.id, ticket.id));
}

/** Dernier paiement de la commande, resynchronisé s'il est encore en cours. */
export async function latestPaymentLink(subscriptionId: number): Promise<PaymentLink | null> {
  const link = (
    await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.subscriptionId, subscriptionId))
      .orderBy(desc(paymentLinks.createdAt))
      .limit(1)
  )[0];
  if (!link || isFinal(link.status)) return link ?? null;
  try {
    return await syncPaymentLink(link);
  } catch (error) {
    console.error("[mollie] synchronisation du paiement impossible", error);
    return link;
  }
}

/**
 * Paiement Mollie pour un abonnement ou un billet en attente.
 * Réutilise le paiement ouvert s'il existe, sinon en crée un au prix lu en base (jamais envoyé par le client) :
 * celui de l'offre pour un abonnement, celui de l'activité pour un billet.
 */
export async function ensurePaymentLink(subscriptionId: number): Promise<PaymentLink | null> {
  const row = (
    await db
      .select({ subscription: subscriptions, plan: plans, activity: activities, session: sessions, user: users })
      .from(subscriptions)
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(sessions, eq(sessions.id, subscriptions.sessionId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1)
  )[0];
  if (!row || row.subscription.paymentStatus === "paid") return null;
  const ticket = row.subscription.kind === "ticket";
  if (!ticket && !row.plan) return null;

  // Prix retenu à l'achat (tarif choisi pour un billet, prix en promotion pour un abonnement),
  // sinon prix de l'activité ou de la formule.
  const amountCents = row.subscription.amountCents ?? (ticket ? row.activity.priceCents : row.plan!.priceCents);

  // Un paiement ouvert n'est repris que s'il est au bon montant (le client a pu changer de tarif entre-temps).
  const current = await latestPaymentLink(subscriptionId);
  if (current && (current.status === "paid" || current.status === "processing")) return current;
  if (current && isLinkUsable(current) && current.amountCents === amountCents) return current;

  // Libellé affiché au client sur la page Mollie et dans le tableau de bord Mollie.
  const description = ticket
    ? `${row.activity.name} — billet${row.subscription.priceLabel ? ` ${row.subscription.priceLabel}` : ""}${
        row.session ? ` du ${formatDateTime(row.session.startsAt)}` : ""
      } (n°${row.subscription.id})`
    : `${row.activity.name} — ${row.plan!.name} (abonnement n°${row.subscription.id})`;

  const created = await createPayment({
    amountCents,
    description,
    redirectUrl: `${appUrl()}/abonnement/${subscriptionId}/paiement?retour=1`,
    webhookUrl: webhookReachable() ? mollieWebhookUrl() : undefined,
    metadata: {
      subscriptionId,
      kind: row.subscription.kind,
      customer: `${row.user.firstName} ${row.user.lastName} <${row.user.email}>`,
    },
  });
  const checkoutUrl = created._links.checkout?.href;
  if (!checkoutUrl) throw new Error(`Paiement Mollie ${created.id} sans page de paiement (statut ${created.status}).`);

  const [link] = await db
    .insert(paymentLinks)
    .values({
      subscriptionId,
      externalId: created.id,
      url: checkoutUrl,
      amountCents,
      status: toLinkStatus(created.status),
      expiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
    })
    .returning();
  return link;
}

/** Webhook : on ne traite que les paiements créés par ce site. */
export async function handlePaymentWebhook(externalId: string): Promise<void> {
  const link = (await db.select().from(paymentLinks).where(eq(paymentLinks.externalId, externalId)).limit(1))[0];
  if (!link) return;
  await syncPaymentLink(link);
}

/**
 * Filet de sécurité (tâche quotidienne) : resynchronise les paiements encore ouverts des 30 derniers jours,
 * au cas où un webhook aurait été manqué.
 */
export async function reconcilePendingPayments(): Promise<{ checked: number; activated: number; error?: string }> {
  if (!(await onlinePaymentsEnabled())) return { checked: 0, activated: 0 };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const pending = await db
      .select()
      .from(paymentLinks)
      .where(and(inArray(paymentLinks.status, ["open", "processing"]), gte(paymentLinks.createdAt, since)));
    let activated = 0;
    for (const link of pending) {
      const updated = await syncPaymentLink(link).catch(() => link);
      if (updated.status === "paid") activated += 1;
    }
    return { checked: pending.length, activated };
  } catch (error) {
    return { checked: 0, activated: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
