"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, attendances, plans, subscriptions } from "@/db/schema";
import { getCurrentUser, randomToken } from "@/lib/auth";
import { activateSubscription } from "@/lib/subscriptions";

/**
 * Étape du parcours client : choix de l'offre → création d'un abonnement en
 * attente de paiement → affichage du prix et du lien de paiement externe.
 */
export async function subscribeAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const planId = Number(formData.get("planId") ?? 0);
  if (!planId) redirect("/activites");

  const plan = (await db.select().from(plans).where(eq(plans.id, planId)).limit(1))[0];
  if (!plan) redirect("/activites");

  if (!user) {
    redirect(
      `/connexion?erreur=loginToSubscribe&next=/activites/${
        (await db.select({ slug: activities.slug }).from(activities).where(eq(activities.id, plan.activityId)).limit(1))[0]
          ?.slug ?? ""
      }`,
    );
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + plan.validityDays * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
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

  revalidatePath("/espace-personnel");
  redirect(`/abonnement/${inserted[0]!.id}/paiement`);
}

/** Confirmation du retour de paiement : active l'abonnement et génère les séances. */
export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const subscriptionId = Number(formData.get("subscriptionId") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim();

  const subscription = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];
  if (!subscription) redirect("/espace-personnel?erreur=subscriptionNotFound");

  await activateSubscription(subscription.id);
  if (reference) {
    await db
      .update(subscriptions)
      .set({ paymentReference: reference })
      .where(eq(subscriptions.id, subscription.id));
  }

  revalidatePath("/espace-personnel");
  revalidatePath("/admin");
  redirect("/espace-personnel?abonnement=actif");
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
