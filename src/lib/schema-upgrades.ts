import { sql } from "drizzle-orm";
import { db } from "@/db";
import { autoConfirmAttendances } from "@/lib/attendance-confirmation";

/**
 * Mises à niveau de la base, exécutées au démarrage du serveur (voir src/instrumentation.ts) avant toute requête :
 * le code peut être déployé sans lancer « drizzle-kit push » à la main. Chaque étape est sans effet si elle est déjà faite.
 */
export async function runSchemaUpgrades(): Promise<void> {
  // Annonces de nouvelles séances : désinscription par lien.
  await db.execute(sql`alter table users add column if not exists announcements_opt_out boolean not null default false`);
  await db.execute(sql`alter table users add column if not exists unsubscribe_token varchar(64)`);
  await db.execute(sql`create unique index if not exists users_unsubscribe_token_unique on users (unsubscribe_token)`);

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

  // Montant des ajouts manuels (chiffre d'affaires). À l'ajout de la colonne, les ajouts manuels déjà faits
  // (présences sans abonnement ni billet) reçoivent le prix de l'activité, ou son plus petit tarif.
  const existing = await db.execute(sql`
    select 1 from information_schema.columns where table_name = 'attendances' and column_name = 'amount_cents'
  `);
  if (existing.rows.length === 0) {
    // Les deux étapes ensemble : un arrêt entre les deux ne laisse pas d'anciens ajouts à 0 €.
    await db.transaction(async (tx) => {
      await tx.execute(sql`alter table attendances add column if not exists amount_cents integer`);
      await tx.execute(sql`
        update attendances a
        set amount_cents = ${MANUAL_PRICE_SQL}
        from sessions s join activities act on act.id = s.activity_id
        where s.id = a.session_id and a.subscription_id is null and a.amount_cents is null
      `);
    });
  }
}

/** Prix d'une place ajoutée à la main : prix de l'activité, sinon son plus petit tarif (alias act = activities). */
const MANUAL_PRICE_SQL = sql.raw(`coalesce(
  nullif(act.price_cents, 0),
  (select min(tp.price_cents) from ticket_prices tp where tp.activity_id = act.id),
  0
)`);
