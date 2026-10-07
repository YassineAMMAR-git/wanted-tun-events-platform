import type { ActivityKind } from "@/db/schema";

/**
 * Le type d'un événement est choisi par l'administration, activité par activité :
 *  - « recurring » : activité à séances, payable à la séance ou par abonnement ;
 *  - « single »    : événement unique, payable par billet.
 */
export const isRecurring = (activity: { kind: ActivityKind | null }) => activity.kind === "recurring";

export const toActivityKind = (value: unknown): ActivityKind => (value === "recurring" ? "recurring" : "single");

/**
 * Avant ce choix, seule la catégorie « club de chant » avait des séances et des abonnements :
 * ses activités existantes deviennent « recurring », toutes les autres « single » (voir backfillActivityKinds).
 */
export const LEGACY_RECURRING_CATEGORY_SLUG = "club-de-chant";

/** Une activité à séances sans séance programmée n'est « terminée » qu'après ce délai (pause entre deux saisons). */
const RECURRING_GRACE_DAYS = 30;

/**
 * Événement terminé : il a eu lieu et plus aucune date n'est à venir.
 * Un événement sans aucune date n'est pas terminé (sa date n'est pas encore annoncée).
 */
export function isFinished(
  activity: { kind: ActivityKind | null },
  upcomingCount: number,
  lastSession: Date | null,
  reference: Date = new Date(),
): boolean {
  if (upcomingCount > 0 || !lastSession) return false;
  if (!isRecurring(activity)) return true;
  return reference.getTime() - lastSession.getTime() > RECURRING_GRACE_DAYS * 24 * 60 * 60 * 1000;
}
