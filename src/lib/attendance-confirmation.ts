import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendances } from "@/db/schema";

/** Canal enregistré sur une présence confirmée d'office (activité sans confirmation de présence). */
export const AUTO_CONFIRM_CHANNEL = "automatique";

/** Une activité demande la confirmation de présence sauf si l'administration l'a désactivée. */
export const requiresConfirmation = (activity: { confirmAttendance: boolean | null }) =>
  activity.confirmAttendance !== false;

/**
 * Activités passées sans confirmation de présence : tous leurs inscrits (déjà payés) sont marqués présents,
 * y compris ceux comptés absents faute d'avoir confirmé à temps. Une absence signalée par le client reste.
 */
export async function autoConfirmAttendances(activityIds: number[]): Promise<number> {
  if (activityIds.length === 0) return 0;
  const updated = await db
    .update(attendances)
    .set({ status: "confirmed", respondedAt: new Date(), responseChannel: AUTO_CONFIRM_CHANNEL })
    .where(
      and(
        sql`${attendances.sessionId} in (select s.id from sessions s where s.activity_id in (${sql.join(
          activityIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`,
        or(
          eq(attendances.status, "pending"),
          and(eq(attendances.status, "declined"), inArray(attendances.responseChannel, ["delai"])),
        ),
      ),
    )
    .returning({ id: attendances.id });
  return updated.length;
}
