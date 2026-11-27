/** Exécuté une fois au démarrage de chaque instance du serveur, avant qu'elle ne traite des requêtes. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runSchemaUpgrades } = await import("@/lib/schema-upgrades");
  try {
    await runSchemaUpgrades();
  } catch (error) {
    // Base injoignable au démarrage : le serveur démarre quand même, l'étape sera refaite au prochain démarrage.
    console.error("[schema] mise à niveau impossible", error);
  }
}
