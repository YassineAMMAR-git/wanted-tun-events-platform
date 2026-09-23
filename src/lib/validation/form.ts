import { z } from "zod";

/** État renvoyé par une Server Action utilisée avec `useActionState`. */
export type FormState<Field extends string = string> = {
  status: "idle" | "error" | "success";
  /** Message global affiché au-dessus du formulaire : clé de traduction (ex. « forms.fixErrors »). */
  message?: string;
  /** Valeurs insérées dans le message global (ex. { minutes: 12 }). */
  messageValues?: Record<string, string | number>;
  /** Erreurs par champ (clés de traduction), affichées sous chaque input. */
  fieldErrors?: Partial<Record<Field, string[]>>;
  /** Valeurs saisies à réafficher après une erreur (jamais les mots de passe). */
  values?: Partial<Record<Field, string>>;
};

export const idleState: FormState = { status: "idle" };

/**
 * Extrait les champs texte attendus d'un FormData.
 * Les champs absents ou non textuels (fichiers) deviennent une chaîne vide.
 */
export function readFields<Field extends string>(formData: FormData, fields: readonly Field[]): Record<Field, string> {
  const result = {} as Record<Field, string>;
  for (const field of fields) {
    const value = formData.get(field);
    result[field] = typeof value === "string" ? value : "";
  }
  return result;
}

/** Construit l'état d'erreur à partir d'une erreur zod, en conservant les valeurs non sensibles. */
export function validationErrorState<Field extends string>(
  error: z.ZodError,
  raw: Record<Field, string>,
  sensitive: readonly Field[] = [],
): FormState<Field> {
  const { fieldErrors } = z.flattenError(error);
  return {
    status: "error",
    message: "forms.fixErrors",
    fieldErrors: fieldErrors as Partial<Record<Field, string[]>>,
    values: withoutSensitive(raw, sensitive),
  };
}

export function withoutSensitive<Field extends string>(
  raw: Record<Field, string>,
  sensitive: readonly Field[],
): Partial<Record<Field, string>> {
  const values: Partial<Record<Field, string>> = { ...raw };
  for (const field of sensitive) delete values[field];
  return values;
}

/** Clé de traduction de la première erreur (pour les formulaires qui redirigent avec un message). */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "validation.invalid";
}

/** Chemin de redirection interne sûr (évite les redirections ouvertes vers un autre site). */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
