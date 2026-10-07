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
