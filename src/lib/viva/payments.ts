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
import {
  PAYMENT_TIMEOUT_SECONDS,
  checkoutUrl,
  createOrder,
  getTransaction,
  listOrderTransactions,
  type VivaTransaction,
} from "@/lib/viva/client";
import { vivaConfigured } from "@/lib/viva/config";
import { formatDateTime } from "@/lib/format";

/** Statuts enregistrés en base (colonne payment_links.status). */
export type PaymentLinkStatus = "open" | "processing" | "paid" | "expired" | "canceled";

/** « A » / « C » : payé côté client, confirmation en cours ; « E » / « X » : refusé ou annulé, à retenter. */
function toLinkStatus(statusId: string): PaymentLinkStatus {
  switch (statusId) {
    case "F":
      return "paid";
    case "A":
    case "C":
      return "processing";
    case "E":
    case "X":
      return "canceled";
    default:
      return "open";
  }
}

/** Les codes de commande Viva sont numériques ; les anciens paiements Mollie (tr_…) ne sont plus consultables. */
const isVivaOrder = (link: PaymentLink) => /^d+$/.test(link.externalId);

/**
 * Délai de grâce après l'expiration de la page de paiement : une transaction commencée juste avant
 * peut encore aboutir. Passé ce délai, une commande sans transaction réussie est expirée.
 */
const EXPIRY_GRACE_MS = 15 * 60 * 1000;

/** Statuts après lesquels un paiement n'évolue plus. */
const FINAL: PaymentLinkStatus[] = ["paid", "expired", "canceled"];
const isFinal = (status: string) => (FINAL as string[]).includes(status);

/** Paiement sur lequel le client peut encore payer (ouvert et non expiré) ou dont la confirmation est en cours. */
export function isLinkUsable(link: PaymentLink | null): boolean {
  if (!link) return false;
  if (link.status === "processing") return true;
  return link.status === "open" && (!link.expiresAt || link.expiresAt.getTime() > Date.now());
}

/** Paiement en ligne actif : identifiants Viva renseignés. */
export async function onlinePaymentsEnabled(): Promise<boolean> {
  return vivaConfigured();
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

/** Une transaction ne compte que si elle appartient bien à cette commande ; une réussite doit être au bon montant. */
function statusFrom(link: PaymentLink, transaction: VivaTransaction): PaymentLinkStatus | null {
  if (transaction.orderCode && transaction.orderCode !== link.externalId) return null;
  const status = toLinkStatus(transaction.statusId);
  if (status === "paid" && transaction.amountCents !== link.amountCents) {
    console.error(
      `[viva] montant inattendu pour la commande ${link.externalId} : ${transaction.amountCents} au lieu de ${link.amountCents}`,
    );
    return null;
  }
  return status;
}

/** État de la commande d'après ses transactions chez Viva (la plus avancée l'emporte). */
async function remoteState(
  link: PaymentLink,
  transactionId: string | null,
): Promise<{ status: PaymentLinkStatus; transactionId: string | null }> {
  // Transaction signalée par le retour du client ou par le webhook : relue chez Viva, jamais crue sur parole.
  const id = transactionId ?? link.transactionId;
  if (id) {
    const status = statusFrom(link, await getTransaction(id));
    if (status === "paid" || status === "processing") return { status, transactionId: id };
    // Refusée ou annulée et signalée à l'instant (retour du client) : il peut retenter avec une nouvelle page.
    if (status && transactionId) return { status, transactionId: id };
  }

  const transactions = await listOrderTransactions(link.externalId);
  for (const wanted of ["paid", "processing"] as const) {
    const found = transactions.find((transaction) => statusFrom(link, transaction) === wanted);
    if (found) return { status: wanted, transactionId: found.id };
  }
  const expired = link.expiresAt && link.expiresAt.getTime() + EXPIRY_GRACE_MS < Date.now();
  return { status: expired ? "expired" : link.status === "processing" ? "processing" : "open", transactionId: id };
}

/**
 * Relit la commande chez Viva (jamais sur la seule foi d'un webhook) et active la commande du site si elle est payée.
 * `transactionId` : transaction signalée par le retour du client ou le webhook.
 */
export async function syncPaymentLink(link: PaymentLink, transactionId: string | null = null): Promise<PaymentLink> {
  // Ancien paiement Mollie encore ouvert : le compte est fermé, il ne peut plus aboutir.
  if (!isVivaOrder(link)) {
    const [closed] = await db
      .update(paymentLinks)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(paymentLinks.id, link.id))
      .returning();
    return closed ?? { ...link, status: "canceled" };
  }
  // Un paiement constaté ne revient jamais en arrière (un webhook d'échec peut arriver après la réussite).
  if (link.status === "paid") return link;

  const remote = await remoteState(link, transactionId);
  const status = remote.status;
  const [updated] = await db
    .update(paymentLinks)
    .set({ status, transactionId: remote.transactionId, updatedAt: new Date() })
    .where(and(eq(paymentLinks.id, link.id), ne(paymentLinks.status, "paid")))
    .returning();
  if (status === "paid") {
    await alignTicketWithPayment(link);
    await claimAndActivate(link.subscriptionId);
  }
  return updated ?? { ...link, status, transactionId: remote.transactionId };
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
    console.error("[viva] synchronisation du paiement impossible", error);
    return link;
  }
}

/**
 * Commande de paiement Viva pour un abonnement ou un billet en attente.
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

  // Libellé affiché au client sur la page de paiement Viva et dans l'espace Viva.
  const description = ticket
    ? `${row.activity.name} — billet${row.subscription.priceLabel ? ` ${row.subscription.priceLabel}` : ""}${
        row.session ? ` du ${formatDateTime(row.session.startsAt)}` : ""
      } (n°${row.subscription.id})`
    : `${row.activity.name} — ${row.plan!.name} (abonnement n°${row.subscription.id})`;

  const orderCode = await createOrder({
    amountCents,
    description,
    merchantReference: `${ticket ? "billet" : "abonnement"} n°${subscriptionId}`,
    customer: { email: row.user.email, fullName: `${row.user.firstName} ${row.user.lastName}`.trim() },
  });

  const [link] = await db
    .insert(paymentLinks)
    .values({
      subscriptionId,
      externalId: orderCode,
      url: checkoutUrl(orderCode),
      amountCents,
      status: "open",
      expiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_SECONDS * 1000),
    })
    .returning();
  return link;
}

/** Paiement du site correspondant à un code de commande Viva (aucun pour une commande créée ailleurs). */
async function findByOrderCode(orderCode: string): Promise<PaymentLink | null> {
  if (!/^d{1,20}$/.test(orderCode)) return null;
  return (await db.select().from(paymentLinks).where(eq(paymentLinks.externalId, orderCode)).limit(1))[0] ?? null;
}

const cleanTransactionId = (value: string | null | undefined) =>
  value && /^[0-9a-f-]{20,64}$/i.test(value) ? value : null;

/** Webhook : on ne traite que les commandes créées par ce site. */
export async function handlePaymentWebhook(orderCode: string, transactionId: string | null): Promise<void> {
  const link = await findByOrderCode(orderCode);
  if (!link) return;
  await syncPaymentLink(link, cleanTransactionId(transactionId));
}

/**
 * Retour du client depuis la page Viva (s = code de commande, t = transaction) :
 * constate le résultat et renvoie la commande du site à afficher.
 */
export async function handlePaymentReturn(orderCode: string, transactionId: string | null): Promise<number | null> {
  const link = await findByOrderCode(orderCode);
  if (!link) return null;
  try {
    await syncPaymentLink(link, cleanTransactionId(transactionId));
  } catch (error) {
    // La page de paiement réessaie à chaque affichage ; le webhook et la tâche quotidienne prennent le relais.
    console.error("[viva] vérification au retour impossible", error);
  }
  return link.subscriptionId;
}

/**
 * Filet de sécurité (tâche quotidienne) : resynchronise les paiements encore ouverts des 30 derniers jours,
 * au cas où le webhook et le retour du client auraient été manqués.
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
