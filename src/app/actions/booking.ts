"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, attendances, categories, plans, sessions, subscriptions } from "@/db/schema";
import { getCurrentUser, randomToken } from "@/lib/auth";
import { offersMemberships } from "@/lib/memberships";
import { ensurePaymentLink, qontoPaymentsEnabled } from "@/lib/qonto/payments";
import { activateSubscription, ticketsSold } from "@/lib/subscriptions";

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
      .select({ plan: plans, activitySlug: activities.slug, categorySlug: categories.slug })
      .from(plans)
      .innerJoin(activities, eq(activities.id, plans.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(eq(plans.id, planId))
      .limit(1)
  )[0];
  // Offre désactivée, ou ancienne offre d'une catégorie sans abonnement : plus en vente.
  if (!row || !row.plan.isActive || !offersMemberships(row.categorySlug)) redirect("/abonnements");
  const { plan } = row;

  if (!user) {
    redirect(`/connexion?erreur=loginToSubscribe&next=/activites/${row.activitySlug}`);
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + plan.validityDays * 24 * 60 * 60 * 1000);

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
      endsAt,
      sessionsIncluded: plan.sessionsIncluded,
      sessionsUsed: 0,
    })
    .returning({ id: subscriptions.id });

  // Paiement Qonto : le lien est préparé tout de suite. En cas d'échec, la page de paiement propose d'en générer un.
  if (await qontoPaymentsEnabled()) {
    await ensurePaymentLink(inserted[0]!.id).catch((error) => console.error("[qonto] création du lien impossible", error));
  }

  revalidatePath("/espace-personnel");
  redirect(`/abonnement/${inserted[0]!.id}/paiement`);
}

/**
 * Billet d'un événement ponctuel (toutes les catégories sauf le club de chant) :
 * une date → un billet au prix de l'activité, en attente de paiement → page de paiement.
 * Un événement gratuit est confirmé immédiatement.
 */
export async function buyTicketAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const sessionId = Number(formData.get("sessionId") ?? 0);
  if (!sessionId) redirect("/activites");

  const row = (
    await db
      .select({ session: sessions, activity: activities, categorySlug: categories.slug })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
  )[0];
  // Le club de chant se souscrit par formule, jamais à la date.
  if (!row || row.activity.status !== "active" || offersMemberships(row.categorySlug)) redirect("/activites");
  const { session, activity } = row;
  const back = `/activites/${activity.slug}`;

  if (session.status !== "scheduled" || session.startsAt.getTime() <= Date.now()) {
    redirect(`${back}?billet=indisponible#billet`);
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
    redirect(existing.paymentStatus === "paid" ? "/espace-personnel?billet=deja" : `/abonnement/${existing.id}/paiement`);
  }

  const sold = (await ticketsSold([session.id])).get(session.id) ?? 0;
  if (sold >= activity.capacity) redirect(`${back}?billet=complet#billet`);

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
    })
    .returning({ id: subscriptions.id });
  const ticketId = inserted[0]!.id;

  if (activity.priceCents <= 0) {
    await activateSubscription(ticketId);
    revalidatePath("/espace-personnel");
    redirect("/espace-personnel?billet=confirme");
  }

  if (await qontoPaymentsEnabled()) {
    await ensurePaymentLink(ticketId).catch((error) => console.error("[qonto] création du lien impossible", error));
  }

  revalidatePath("/espace-personnel");
  redirect(`/abonnement/${ticketId}/paiement`);
}

/** Nouveau lien de paiement Qonto (le précédent a expiré, a été annulé ou n'a pas pu être créé). */
export async function createPaymentLinkAction(formData: FormData): Promise<void> {
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

  let failed = false;
  try {
    await ensurePaymentLink(owned.id);
  } catch (error) {
    console.error("[qonto] création du lien impossible", error);
    failed = true;
  }
  redirect(`/abonnement/${owned.id}/paiement${failed ? "?lien=erreur" : ""}`);
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

/** Réponse à un rappel depuis l'espace personnel. */
export async function respondAttendanceAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const attendanceId = Number(formData.get("attendanceId") ?? 0);
  const response = String(formData.get("response") ?? "confirmed") === "declined" ? "declined" : "confirmed";

  await db
    .update(attendances)
    .set({
      status: response,
      respondedAt: new Date(),
      responseChannel: "espace-personnel",
      token: randomToken(),
    })
    .where(and(eq(attendances.id, attendanceId), eq(attendances.userId, user.id)));

  revalidatePath("/espace-personnel");
}
