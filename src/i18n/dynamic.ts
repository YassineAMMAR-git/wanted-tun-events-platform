/**
 * Traduit une clé connue seulement à l'exécution (message renvoyé par une action serveur,
 * paramètre ?ok= d'une URL…). Une clé inconnue n'est jamais affichée telle quelle.
 */
type AnyTranslator = {
  (key: never, values?: never): string;
  has(key: never): boolean;
};

export function translateKey(
  t: AnyTranslator,
  key: string | undefined,
  values?: Record<string, string | number>,
  fallback = "",
): string {
  if (!key) return fallback;
  const translate = t as unknown as ((key: string, values?: Record<string, string | number>) => string) & {
    has(key: string): boolean;
  };
  return translate.has(key) ? translate(key, values) : fallback;
}
