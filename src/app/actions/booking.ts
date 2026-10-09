"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, attendances, plans, sessions, subscriptions, ticketPrices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isRecurring } from "@/lib/memberships";
import { ensurePaymentLink, latestPaymentLink, onlinePaymentsEnabled } from "@/lib/mollie/payments";
import { activateSubscription, membershipEndsAt, placesTaken, respondToAttendance } from "@/lib/subscriptions";

/**
 * Étape du parcours client : choix de l'offre → création d'un abonnement en
 * attente de paiement → affichage du prix et du lien de paiement externe.
 */
export async function subscribeAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const planId = Number(formData.get("planId") ?? 0);
  if (!planId) redirect("/activites");

  const row = (
    await db
      .select({ plan: plans, activity: activities })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .where(eq(plans.id, planId))
      .limit(1)
  )[0];
  // Offre désactivée, ou ancienne offre d'un événement unique : plus en vente.
  if (!row || !row.plan.isActive || !isRecurring(row.activity)) redirect("/abonnements");
  // Billetterie externe : rien ne se vend sur le site pour cette activité.
  if (row.activity.ticketUrl) redirect(`/activites/${row.activity.slug}`);
  const { plan } = row;

  if (!user) {
    redirect(`/connexion?erreur=loginToSubscribe&next=/activites/${row.activity.slug}`);
  }

  const startsAt = new Date();

  const inserted = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
      kind: "membership",
      planId: plan.id,
      activityId: plan.activityId,
      status: "pending",
      paymentStatus: "pending",
      startsAt,
      endsAt: membershipEndsAt(startsAt),
      sessionsIncluded: plan.sessionsIncluded,
      sessionsUsed: 0,
    })
    .returning({ id: subscriptions.id });

  revalidatePath("/espace-personnel");
  redirect(`/abonnement/${inserted[0]!.id}/paiement`);
}

/**
 * Achat à la date : billet d'un événement unique, ou une séance d'une activité à séances payée à l'unité.
 * Une date → un billet au prix de l'activité, en attente de paiement → page de paiement.
 * Un événement unique gratuit est confirmé immédiatement.
 */
export async function buyTicketAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const sessionId = Number(formData.get("sessionId") ?? 0);
  if (!sessionId) redirect("/activites");

  const row = (
    await db
      .select({ session: sessions, activity: activities })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
  )[0];
  if (!row || row.activity.status !== "active") redirect("/activites");
  const { session, activity } = row;
  const recurring = isRecurring(activity);
  const back = `/activites/${activity.slug}`;
  const anchor = recurring ? "seances" : "billet";
  // Billetterie externe : la réservation se fait sur le site partenaire.
  if (activity.ticketUrl) redirect(`${back}#${anchor}`);
  // Activité à séances sans tarif à la séance : elle ne se vend que par abonnement.
  if (recurring && activity.priceCents <= 0) redirect(back);

  // Événement unique à plusieurs tarifs : le client doit en avoir choisi un (le prix est relu en base).
  let amountCents = activity.priceCents;
  let priceLabel: string | null = null;
  if (!recurring) {
    const tiers = await db.select().from(ticketPrices).where(eq(ticketPrices.activityId, activity.id));
    if (tiers.length > 0) {
      const chosen = tiers.find((tier) => tier.id === Number(formData.get("priceId") ?? 0));
      if (!chosen) redirect(`${back}?billet=tarif#billet`);
      amountCents = chosen.priceCents;
      priceLabel = chosen.name;
    }
  }

  if (session.status !== "scheduled" || session.startsAt.getTime() <= Date.now()) {
    redirect(`${back}?billet=indisponible#${anchor}`);
  }
  if (!user) redirect(`/connexion?erreur=loginToBuyTicket&next=${back}`);

  // Un seul billet par personne et par date : on reprend celui déjà commencé.
  const existing = (
    await db
      .select({ id: subscriptions.id, paymentStatus: subscriptions.paymentStatus })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.kind, "ticket"),
          eq(subscriptions.userId, user.id),
          eq(subscriptions.sessionId, session.id),
          ne(subscriptions.status, "cancelled"),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.paymentStatus === "paid") redirect("/espace-personnel?billet=deja");
    // Billet commencé mais pas payé : il prend le tarif choisi cette fois-ci.
    await db.update(subscriptions).set({ amountCents, priceLabel }).where(eq(subscriptions.id, existing.id));
    redirect(`/abonnement/${existing.id}/paiement`);
  }

  // Déjà inscrit à cette date par un abonnement (ou ajouté par l'administration) : rien à payer.
  const attending = (
    await db
      .select({ id: attendances.id })
      .from(attendances)
      .where(and(eq(attendances.sessionId, session.id), eq(attendances.userId, user.id)))
      .limit(1)
  )[0];
  if (attending) redirect("/espace-personnel?billet=deja");

  const taken = (await placesTaken([session.id])).get(session.id) ?? 0;
  if (taken >= activity.capacity) redirect(`${back}?billet=complet#${anchor}`);

  const inserted = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
      kind: "ticket",
      planId: null,
      activityId: activity.id,
      sessionId: session.id,
      status: "pending",
      paymentStatus: "pending",
      startsAt: new Date(),
      // Le billet expire à la fin de l'événement (tâche quotidienne).
      endsAt: new Date(session.startsAt.getTime() + session.durationMinutes * 60 * 1000),
      sessionsIncluded: 1,
      sessionsUsed: 0,
      amountCents,
      priceLabel,
    })
    .returning({ id: subscriptions.id });
  const ticketId = inserted[0]!.id;

  if (amountCents <= 0) {
    await activateSubscription(ticketId);
    revalidatePath("/espace-personnel");
    redirect("/espace-personnel?billet=confirme");
  }

  revalidatePath("/espace-personnel");
  redirect(`/abonnement/${ticketId}/paiement`);
}

/**
 * Bouton « Payer » : crée (ou reprend) le paiement Mollie de la commande puis envoie le client sur la page Mollie.
 * Mollie le renvoie ensuite sur la page de paiement du site, qui constate le résultat.
 */
export async function startPaymentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const subscriptionId = Number(formData.get("subscriptionId") ?? 0);

  const owned = (
    await db
      .select({ subscription: subscriptions, session: sessions })
      .from(subscriptions)
      .leftJoin(sessions, eq(sessions.id, subscriptions.sessionId))
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];
  if (!owned) redirect("/espace-personnel?erreur=subscriptionNotFound");
  const page = `/abonnement/${owned.subscription.id}/paiement`;
  // Commande annulée par le client : elle ne se paie plus (il peut en refaire une).
  if (owned.subscription.status === "cancelled") redirect(page);

  // Billet d'une date annulée ou passée : plus en vente (la page de paiement l'explique).
  const { session } = owned;
  if (
    owned.subscription.kind === "ticket" &&
    (!session || session.status !== "scheduled" || session.startsAt.getTime() <= Date.now())
  ) {
    redirect(page);
  }

  let checkoutUrl: string | null = null;
  try {
    const link = await ensurePaymentLink(owned.subscription.id);
    if (link && link.status === "open") checkoutUrl = link.url;
  } catch (error) {
    console.error("[mollie] création du paiement impossible", error);
    redirect(`${page}?lien=erreur`);
  }
  // Déjà payé ou confirmation en cours : la page de paiement affiche l'état.
  redirect(checkoutUrl ?? page);
}

/**
 * Le client annule une commande qu'il n'a pas payée (abonnement ou billet choisi par erreur) :
 * elle quitte « Paiement en attente » et il peut en refaire une autre.
 * Jamais sur une commande payée, ni pendant qu'un paiement est en cours de confirmation.
 */
export async function cancelPendingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const subscriptionId = Number(formData.get("subscriptionId") ?? 0);

  const owned = (
    await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];
  if (!owned) redirect("/espace-personnel?erreur=subscriptionNotFound");

  // Dernière vérification chez Mollie : si le paiement vient d'aboutir, la commande est activée au lieu d'être annulée.
  if (await onlinePaymentsEnabled()) {
    const link = await latestPaymentLink(owned.id);
    if (link?.status === "paid") redirect("/espace-personnel");
    if (link?.status === "processing") redirect("/espace-personnel?erreur=paymentInProgress");
  }

  // Seule une commande encore en attente, sans paiement signalé, peut être annulée (condition revérifiée en base).
  const cancelled = await db
    .update(subscriptions)
    .set({ status: "cancelled", paymentStatus: "cancelled" })
    .where(
      and(
        eq(subscriptions.id, owned.id),
        eq(subscriptions.userId, user.id),
        eq(subscriptions.status, "pending"),
        eq(subscriptions.paymentStatus, "pending"),
      ),
    )
    .returning({ id: subscriptions.id });

  revalidatePath("/espace-personnel");
  revalidatePath("/admin");
  redirect(cancelled[0] ? "/espace-personnel?commande=annulee" : "/espace-personnel");
}

/**
 * Le client déclare avoir réglé sur la plateforme externe.
 *
 * Cette déclaration n'active **rien** : elle ne fait que signaler l'abonnement à
 * l'administration, qui vérifie l'encaissement puis le marque payé (`/admin`).
 * Activer ici sur la seule parole du client reviendrait à distribuer des
 * abonnements gratuits à qui clique sur le bouton.
 */
export async function declarePaymentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const subscriptionId = Number(formData.get("subscriptionId") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120);

  const subscription = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];
  if (!subscription) redirect("/espace-personnel?erreur=subscriptionNotFound");

  // Un abonnement déjà encaissé ne redescend pas en « déclaré ».
  if (subscription.paymentStatus !== "paid") {
    await db
      .update(subscriptions)
      .set({
        paymentStatus: "declared",
        ...(reference ? { paymentReference: reference } : {}),
      })
      .where(eq(subscriptions.id, subscription.id));
  }

  revalidatePath("/espace-personnel");
  revalidatePath("/admin");
  redirect(`/abonnement/${subscription.id}/paiement?declare=1`);
}

/** Réponse à une séance depuis l'espace personnel (confirmation possible jusqu'à 48 h avant). */
export async function respondAttendanceAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const attendanceId = Number(formData.get("attendanceId") ?? 0);
  const response = String(formData.get("response") ?? "confirmed") === "declined" ? "declined" : "confirmed";

  const result = await respondToAttendance({ id: attendanceId, userId: user.id }, response, "espace-personnel");
  revalidatePath("/espace-personnel");
  if (result === "closed") redirect("/espace-personnel?erreur=confirmationClosed");
}
