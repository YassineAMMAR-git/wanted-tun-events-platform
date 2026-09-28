/**
 * Les abonnements ne concernent que le club de chant : c'est la seule activité régulière.
 * Les autres catégories (concerts, campings, soirées…) sont des événements ponctuels, sans formule.
 *
 * Le slug d'une catégorie est fixé à sa création et n'est jamais modifié ensuite : il sert donc de repère stable.
 */
export const MEMBERSHIP_CATEGORY_SLUG = "club-de-chant";

export const offersMemberships = (categorySlug: string | null | undefined) => categorySlug === MEMBERSHIP_CATEGORY_SLUG;
