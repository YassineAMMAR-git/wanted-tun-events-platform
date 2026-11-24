import { sql } from "drizzle-orm";
import { db } from "@/db";
import { autoConfirmAttendances } from "@/lib/attendance-confirmation";

/**
 * Mises à niveau de la base, exécutées au démarrage du serveur (voir src/instrumentation.ts) avant toute requête :
 * le code peut être déployé sans lancer « drizzle-kit push » à la main. Chaque étape est sans effet si elle est déjà faite.
 */
export async function runSchemaUpgrades(): Promise<void> {
  // Confirmation de présence choisie activité par activité.
  await db.execute(sql`alter table activities add column if not exists confirm_attendance boolean`);
  // Activités antérieures à ce choix : les excursions et séjours n'ont plus de confirmation, les autres la gardent.
  const backfilled = await db.execute<{ id: number; confirm_attendance: boolean }>(sql`
    update activities
    set confirm_attendance = category_id not in (
      select id from categories where slug ilike '%excursion%' or name ilike '%excursion%'
    )
    where confirm_attendance is null
    returning id, confirm_attendance
  `);
  const withoutConfirmation = backfilled.rows.filter((row) => row.confirm_attendance === false).map((row) => row.id);
  await autoConfirmAttendances(withoutConfirmation);
}
