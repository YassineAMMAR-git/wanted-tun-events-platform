import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  activities,
  planPromotions,
  plans,
  subscriptions,
  type Plan,
} from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { localize } from "@/lib/i18n/content";

/*
 * Promotion d'une formule : une réduction en pourcentage, accordée automatiquement aux clients qui ont déjà
 * payé au moins une des formules choisies par l'administration (formules d'autres activités).
 * Le prix réduit est fixé à la création de la commande (subscriptions.amount_cents) : c'est lui qui est payé.
 */

export type Promotion = { percent: number; requiredPlanIds: number[] };

/** Réduction maximale : au-delà, il ne resterait rien à payer en ligne. */
export const PROMO_MAX_PERCENT = 99;

export const discountedPrice = (priceCents: number, percent: number) =>
  Math.max(Math.round((priceCents * (100 - percent)) / 100), 0);

/** Promotions des formules demandées (toutes si aucune liste). Vide si la table n'existe pas encore sur cette base. */
export async function loadPromotions(planIds?: number[]): Promise<Map<number, Promotion>> {
  if (planIds && planIds.length === 0) return new Map();
  try {
    const rows = await db
      .select()
      .from(planPromotions)
      .where(planIds ? inArray(planPromotions.planId, planIds) : undefined);
    return new Map(rows.map((row) => [row.planId, { percent: row.percent, requiredPlanIds: row.requiredPlanIds }]));
  } catch (error) {
    // Table absente tant que « drizzle-kit push » n'a pas été lancé sur cette base : aucune promotion.
    console.error("[promotions] lecture impossible", error);
    return new Map();
  }
}

/** Formules que le client possède : abonnements payés et non annulés (en cours ou terminés). */
export async function ownedPlanIds(userId: number): Promise<Set<number>> {
  const rows = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.kind, "membership"),
        eq(subscriptions.paymentStatus, "paid"),
        ne(subscriptions.status, "cancelled"),
      ),
    );
  return new Set(rows.flatMap((row) => (row.planId ? [row.planId] : [])));
}

/** Prix d'une formule pour ce client : réduit s'il possède une des formules exigées par la promotion. */
export async function promotionForClient(
  plan: Pick<Plan, "id" | "priceCents">,
  userId: number,
): Promise<{ percent: number; priceCents: number } | null> {
  const promotion = (await loadPromotions([plan.id])).get(plan.id);
  if (!promotion) return null;
  const owned = await ownedPlanIds(userId);
  if (!promotion.requiredPlanIds.some((id) => owned.has(id))) return null;
  return { percent: promotion.percent, priceCents: discountedPrice(plan.priceCents, promotion.percent) };
}

export type PlanOffer = {
  percent: number;
  /** Le client connecté remplit la condition : le prix réduit lui est appliqué. */
  eligible: boolean;
  priceCents: number;
  /** Formules qui donnent droit à la promotion (« Activité — Formule »), pour l'annoncer aux autres clients. */
  requiredNames: string[];
};

/** Promotions à afficher sur les formules d'une page publique, pour le client connecté (ou un visiteur). */
export async function planOffers(
  planList: Pick<Plan, "id" | "priceCents">[],
  userId: number | null,
  locale: Locale,
): Promise<Map<number, PlanOffer>> {
  const promotions = await loadPromotions(planList.map((plan) => plan.id));
  if (promotions.size === 0) return new Map();

  const requiredIds = [...new Set([...promotions.values()].flatMap((promotion) => promotion.requiredPlanIds))];
  const [owned, required] = await Promise.all([
    userId ? ownedPlanIds(userId) : new Set<number>(),
    requiredIds.length > 0
      ? db
          .select({ plan: plans, activity: activities })
          .from(plans)
          .innerJoin(activities, eq(activities.id, plans.activityId))
          .where(inArray(plans.id, requiredIds))
      : [],
  ]);
  const names = new Map(
    required.map((row) => [
      row.plan.id,
      `${localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name} — ${localize(row.plan, locale, PLAN_TRANSLATABLE).name}`,
    ]),
  );

  const offers = new Map<number, PlanOffer>();
  for (const plan of planList) {
    const promotion = promotions.get(plan.id);
    if (!promotion) continue;
    // Une formule exigée qui a été supprimée depuis ne compte plus.
    const requiredNames = promotion.requiredPlanIds.flatMap((id) => (names.has(id) ? [names.get(id)!] : []));
    if (requiredNames.length === 0) continue;
    offers.set(plan.id, {
      percent: promotion.percent,
      eligible: promotion.requiredPlanIds.some((id) => owned.has(id)),
      priceCents: discountedPrice(plan.priceCents, promotion.percent),
      requiredNames,
    });
  }
  return offers;
}

export type PromoPlanOption = { id: number; activityId: number; activityName: string; planName: string };

/** Formules proposées à l'administration comme condition d'une promotion, triées par activité. */
export async function promoPlanOptions(locale: Locale): Promise<PromoPlanOption[]> {
  const rows = await db
    .select({ plan: plans, activity: activities })
    .from(plans)
    .innerJoin(activities, eq(activities.id, plans.activityId))
    .where(eq(activities.kind, "recurring"))
    .orderBy(asc(activities.name), asc(plans.name));
  return rows.map((row) => ({
    id: row.plan.id,
    activityId: row.plan.activityId,
    activityName: localize(row.activity, locale, ACTIVITY_TRANSLATABLE).name ?? "",
    planName: localize(row.plan, locale, PLAN_TRANSLATABLE).name ?? "",
  }));
}

/**
 * Enregistre la promotion saisie dans le formulaire d'une formule (case cochée, pourcentage, formules exigées),
 * ou la retire si la case est décochée. Renvoie la clé du message d'erreur à afficher, sinon null.
 */
export async function savePlanPromotion(planId: number, activityId: number, formData: FormData): Promise<string | null> {
  const enabled = formData.get("promoEnabled") === "on";
  try {
    if (!enabled) {
      await db.delete(planPromotions).where(eq(planPromotions.planId, planId));
      return null;
    }
    const percent = Math.round(Number(String(formData.get("promoPercent") ?? "").replace(",", ".")));
    const wanted = formData.getAll("promoPlanIds").map(Number).filter((id) => Number.isInteger(id) && id > 0);
    // Seules les formules d'une autre activité donnent droit à la promotion.
    const valid =
      wanted.length > 0
        ? await db
            .select({ id: plans.id })
            .from(plans)
            .where(and(inArray(plans.id, wanted), ne(plans.activityId, activityId)))
        : [];
    if (!(percent >= 1 && percent <= PROMO_MAX_PERCENT) || valid.length === 0) return "promoIncomplete";

    const values = { percent, requiredPlanIds: valid.map((row) => row.id) };
    await db
      .insert(planPromotions)
      .values({ planId, ...values })
      .onConflictDoUpdate({ target: planPromotions.planId, set: values });
    return null;
  } catch (error) {
    console.error("[promotions] enregistrement impossible", error);
    // Sans la table, une promotion demandée ne peut pas être enregistrée ; une case décochée ne change rien.
    return enabled ? "promoUnavailable" : null;
  }
}
