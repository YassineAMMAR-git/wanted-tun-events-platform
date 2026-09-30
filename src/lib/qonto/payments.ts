import "server-only";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, paymentLinks, plans, sessions, subscriptions, users, type PaymentLink } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { activateSubscription } from "@/lib/subscriptions";
import { createPaymentLink, getAccessToken, getConnection, getPaymentLink, type PaymentLinkStatus } from "@/lib/qonto/client";
import { qontoConfigured, qontoVatRate } from "@/lib/qonto/config";

/** Statuts après lesquels un lien n'évolue plus. */
const FINAL: PaymentLinkStatus[] = ["paid", "expired", "canceled"];
const isFinal = (status: string) => (FINAL as string[]).includes(status);

/** Lien sur lequel le client peut encore payer (ouvert et non expiré) ou dont le paiement est en validation. */
export function isLinkUsable(link: PaymentLink | null): boolean {
  if (!link) return false;
  if (link.status === "processing") return true;
  return link.status === "open" && (!link.expiresAt || link.expiresAt.getTime() > Date.now());
}

/** Paiement en ligne actif : identifiants configurés et compte Qonto connecté. */
export async function qontoPaymentsEnabled(): Promise<boolean> {
  if (!qontoConfigured()) return false;
  try {
    return Boolean(await getConnection());
  } catch {
    // Tables pas encore créées sur cette base : on reste en paiement manuel.
    return false;
  }
}

/**
 * Passe l'abonnement en « payé » une seule fois, même si le webhook, la page de paiement
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

/** Relit le lien chez Qonto (jamais sur la seule foi d'un webhook) et active l'abonnement s'il est payé. */
export async function syncPaymentLink(link: PaymentLink): Promise<PaymentLink> {
  const remote = await getPaymentLink(link.externalId);
  const status = remote.status ?? link.status;
  const [updated] = await db
    .update(paymentLinks)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentLinks.id, link.id))
    .returning();
  if (status === "paid") await claimAndActivate(link.subscriptionId);
  return updated ?? { ...link, status };
}

/** Dernier lien de l'abonnement, resynchronisé s'il est encore en cours. */
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
    console.error("[qonto] synchronisation du lien impossible", error);
    return link;
  }
}

/**
 * Lien de paiement à usage unique pour un abonnement ou un billet en attente.
 * Réutilise le lien ouvert s'il existe, sinon en crée un au prix lu en base (jamais envoyé par le client) :
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

  const current = await latestPaymentLink(subscriptionId);
  if (current && (current.status === "paid" || isLinkUsable(current))) return current;

  const amountCents = ticket ? row.activity.priceCents : row.plan!.priceCents;
  const customer = `${row.user.firstName} ${row.user.lastName} (${row.user.email})`;
  const created = await createPaymentLink({
    title: ticket
      ? `${row.activity.name} — billet${row.session ? ` du ${formatDateTime(row.session.startsAt)}` : ""}`
      : `${row.activity.name} — ${row.plan!.name}`,
    description: `${ticket ? "Billet" : "Abonnement"} n°${row.subscription.id} — ${customer}`,
    amountCents,
    vatRate: qontoVatRate(),
  });

  const [link] = await db
    .insert(paymentLinks)
    .values({
      subscriptionId,
      externalId: created.id,
      url: created.url,
      amountCents,
      status: created.status ?? "open",
      expiresAt: created.expiration_date ? new Date(created.expiration_date) : null,
    })
    .returning();
  return link;
}

/** Événement webhook : on ne traite que les liens créés par ce site. */
export async function handlePaymentLinkEvent(externalId: string): Promise<void> {
  const link = (await db.select().from(paymentLinks).where(eq(paymentLinks.externalId, externalId)).limit(1))[0];
  if (!link) return;
  await syncPaymentLink(link);
}

/**
 * Filet de sécurité (tâche quotidienne) : resynchronise les liens encore ouverts des 30 derniers jours
 * et renouvelle le jeton Qonto, ce qui prolonge la connexion de 90 jours à chaque passage.
 */
export async function reconcilePendingPayments(): Promise<{ checked: number; activated: number; error?: string }> {
  if (!(await qontoPaymentsEnabled())) return { checked: 0, activated: 0 };
  try {
    await getAccessToken({ force: true });
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
