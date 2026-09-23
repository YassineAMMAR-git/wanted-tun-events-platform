// Constantes de validation sans dépendance (utilisables dans les composants client sans charger zod).

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Valeurs insérées dans les messages de validation ({min}, {max}). */
export const VALIDATION_MESSAGE_VALUES = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH };
