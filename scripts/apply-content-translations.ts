/**
 * Ajoute les traductions anglaises et arabes du contenu de démonstration à une base existante.
 *
 *   npm run content:translate
 *
 * Sans effet sur le contenu créé par l'administration (seuls les éléments de démonstration reconnus
 * par leur slug ou leur nom français sont complétés). Peut être relancé sans risque.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { activities, categories, plans, sessions } from "@/db/schema";
import {
  ACTIVITY_TRANSLATIONS,
  CATEGORY_TRANSLATIONS,
  PLAN_TRANSLATIONS,
  sessionTranslations,
} from "@/lib/content-translations";

async function main() {
  const counts = { categories: 0, activities: 0, plans: 0, sessions: 0 };

  await db.transaction(async (tx) => {
    for (const row of await tx.select({ id: categories.id, slug: categories.slug }).from(categories)) {
      const translations = CATEGORY_TRANSLATIONS[row.slug];
      if (!translations) continue;
      await tx.update(categories).set({ translations }).where(eq(categories.id, row.id));
      counts.categories += 1;
    }

    for (const row of await tx.select({ id: activities.id, slug: activities.slug }).from(activities)) {
      const translations = ACTIVITY_TRANSLATIONS[row.slug];
      if (!translations) continue;
      await tx.update(activities).set({ translations }).where(eq(activities.id, row.id));
      counts.activities += 1;
    }

    for (const row of await tx.select({ id: plans.id, name: plans.name }).from(plans)) {
      const translations = PLAN_TRANSLATIONS[row.name];
      if (!translations) continue;
      await tx.update(plans).set({ translations }).where(eq(plans.id, row.id));
      counts.plans += 1;
    }

    for (const row of await tx.select({ id: sessions.id, title: sessions.title }).from(sessions)) {
      const translations = sessionTranslations(row.title);
      if (Object.keys(translations).length === 0) continue;
      await tx.update(sessions).set({ translations }).where(eq(sessions.id, row.id));
      counts.sessions += 1;
    }
  });

  console.log("Traductions appliquées :", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
